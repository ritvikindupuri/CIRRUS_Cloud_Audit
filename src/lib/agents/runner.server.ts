// Server-only agent execution engine. Runs one agent's LLM loop, gives it
// a small set of read-only AWS tools, and persists every thought / tool
// call / tool result to agent_steps as it happens. Findings get inserted
// into the findings table.
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { z } from "zod";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import {
  IAMClient,
  ListUsersCommand,
  ListRolesCommand,
  ListAttachedUserPoliciesCommand,
  ListAttachedRolePoliciesCommand,
  ListAccountAliasesCommand,
  GetAccountSummaryCommand,
  ListAccessKeysCommand,
} from "@aws-sdk/client-iam";
import {
  S3Client,
  ListBucketsCommand,
  GetPublicAccessBlockCommand,
  GetBucketEncryptionCommand,
  GetBucketPolicyStatusCommand,
  GetBucketLocationCommand,
} from "@aws-sdk/client-s3";
import {
  EC2Client,
  DescribeRegionsCommand,
  DescribeSecurityGroupsCommand,
  DescribeInstancesCommand,
} from "@aws-sdk/client-ec2";

import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import type { AgentType, BuiltinAgentType, AwsService } from "@/lib/agents/definitions";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface AwsCredsInput {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

interface RunCtx {
  supabase: SupabaseClient;
  agentRunId: string;
  scanId: string;
  creds: AwsCredsInput;
  stepCounter: { i: number };
}

async function logStep(
  ctx: RunCtx,
  step: {
    kind: "thought" | "tool_call" | "tool_result" | "final";
    thought?: string;
    tool_name?: string;
    tool_input?: unknown;
    tool_output?: unknown;
    error?: string;
  },
) {
  const idx = ctx.stepCounter.i++;
  const { error } = await ctx.supabase.from("agent_steps").insert({
    agent_run_id: ctx.agentRunId,
    step_index: idx,
    kind: step.kind,
    thought: step.thought ?? null,
    tool_name: step.tool_name ?? null,
    tool_input: step.tool_input ?? null,
    tool_output: step.tool_output ?? null,
    error: step.error ?? null,
  });
  if (error) console.error("[cirrus] failed to persist step", error);
}

async function addFinding(
  ctx: RunCtx,
  f: {
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    description?: string;
    resource?: string;
    evidence?: unknown;
  },
) {
  await ctx.supabase.from("findings").insert({
    scan_id: ctx.scanId,
    agent_run_id: ctx.agentRunId,
    severity: f.severity,
    title: f.title,
    description: f.description ?? null,
    resource: f.resource ?? null,
    evidence: f.evidence ?? null,
  });
}

function awsConfig(creds: AwsCredsInput, region?: string) {
  return {
    region: region ?? creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  };
}

function summarize<T>(value: T, max = 2000): T | string {
  try {
    const json = JSON.stringify(value);
    if (json.length <= max) return value;
    return json.slice(0, max) + `… [truncated ${json.length - max} chars]`;
  } catch {
    return value;
  }
}

// ─── Tool factories ────────────────────────────────────────────────────────

function makeReconTools(ctx: RunCtx) {
  return {
    aws_sts_get_caller_identity: tool({
      description:
        "STS GetCallerIdentity — returns the AWS account, IAM ARN, and user/role ID for the configured credentials.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws sts get-caller-identity";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_sts_get_caller_identity",
          tool_input: { command: cmd },
        });
        const client = new STSClient(awsConfig(ctx.creds));
        const out = await client.send(new GetCallerIdentityCommand({}));
        const result = { Account: out.Account, Arn: out.Arn, UserId: out.UserId };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_sts_get_caller_identity",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    aws_iam_list_account_aliases: tool({
      description: "IAM ListAccountAliases — the human-friendly alias for the account, if any.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws iam list-account-aliases";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_account_aliases",
          tool_input: { command: cmd },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListAccountAliasesCommand({}));
        const result = { AccountAliases: out.AccountAliases ?? [] };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_account_aliases",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    aws_ec2_describe_regions: tool({
      description: "EC2 DescribeRegions — list of regions enabled for this account.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws ec2 describe-regions --all-regions";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_ec2_describe_regions",
          tool_input: { command: cmd },
        });
        const client = new EC2Client(awsConfig(ctx.creds));
        const out = await client.send(new DescribeRegionsCommand({ AllRegions: true }));
        const result = {
          Regions: (out.Regions ?? []).map((r) => ({
            RegionName: r.RegionName,
            OptInStatus: r.OptInStatus,
          })),
        };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_ec2_describe_regions",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    aws_iam_get_account_summary: tool({
      description:
        "IAM GetAccountSummary — counts of users, roles, MFA devices, and account-level posture.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws iam get-account-summary";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_get_account_summary",
          tool_input: { command: cmd },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new GetAccountSummaryCommand({}));
        const result = { SummaryMap: out.SummaryMap };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_get_account_summary",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    report_finding: tool({
      description: "Record a security finding for the scan report.",
      inputSchema: z.object({
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        title: z.string(),
        description: z.string().optional(),
        resource: z.string().optional(),
      }),
      execute: async ({ severity, title, description, resource }) => {
        await addFinding(ctx, { severity, title, description, resource });
        return { ok: true };
      },
    }),
  };
}

function makeIamTools(ctx: RunCtx) {
  return {
    aws_iam_list_users: tool({
      description: "IAM ListUsers — enumerate all IAM users.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws iam list-users";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_users",
          tool_input: { command: cmd },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListUsersCommand({}));
        const result = {
          Users: (out.Users ?? []).map((u) => ({
            UserName: u.UserName,
            Arn: u.Arn,
            CreateDate: u.CreateDate,
            PasswordLastUsed: u.PasswordLastUsed,
          })),
        };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_users",
          tool_output: { command: cmd, result: summarize(result) },
        });
        return result;
      },
    }),
    aws_iam_list_roles: tool({
      description: "IAM ListRoles — enumerate roles in the account.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws iam list-roles";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_roles",
          tool_input: { command: cmd },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListRolesCommand({}));
        const result = {
          Roles: (out.Roles ?? []).slice(0, 50).map((r) => ({
            RoleName: r.RoleName,
            Arn: r.Arn,
            CreateDate: r.CreateDate,
          })),
        };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_roles",
          tool_output: { command: cmd, result: summarize(result) },
        });
        return result;
      },
    }),
    aws_iam_list_attached_user_policies: tool({
      description: "IAM ListAttachedUserPolicies — managed policies attached to a specific user.",
      inputSchema: z.object({ user_name: z.string() }),
      execute: async ({ user_name }) => {
        const cmd = `aws iam list-attached-user-policies --user-name ${user_name}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_attached_user_policies",
          tool_input: { command: cmd, user_name },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListAttachedUserPoliciesCommand({ UserName: user_name }));
        const result = { AttachedPolicies: out.AttachedPolicies ?? [] };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_attached_user_policies",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    aws_iam_list_attached_role_policies: tool({
      description: "IAM ListAttachedRolePolicies — managed policies attached to a specific role.",
      inputSchema: z.object({ role_name: z.string() }),
      execute: async ({ role_name }) => {
        const cmd = `aws iam list-attached-role-policies --role-name ${role_name}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_attached_role_policies",
          tool_input: { command: cmd, role_name },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListAttachedRolePoliciesCommand({ RoleName: role_name }));
        const result = { AttachedPolicies: out.AttachedPolicies ?? [] };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_attached_role_policies",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    aws_iam_list_access_keys: tool({
      description: "IAM ListAccessKeys — access keys for a user (look for old / unused keys).",
      inputSchema: z.object({ user_name: z.string() }),
      execute: async ({ user_name }) => {
        const cmd = `aws iam list-access-keys --user-name ${user_name}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_iam_list_access_keys",
          tool_input: { command: cmd, user_name },
        });
        const client = new IAMClient(awsConfig(ctx.creds));
        const out = await client.send(new ListAccessKeysCommand({ UserName: user_name }));
        const result = { AccessKeyMetadata: out.AccessKeyMetadata ?? [] };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_iam_list_access_keys",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    report_finding: tool({
      description: "Record a security finding for the scan report.",
      inputSchema: z.object({
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        title: z.string(),
        description: z.string().optional(),
        resource: z.string().optional(),
      }),
      execute: async ({ severity, title, description, resource }) => {
        await addFinding(ctx, { severity, title, description, resource });
        return { ok: true };
      },
    }),
  };
}

function makeS3Tools(ctx: RunCtx) {
  return {
    aws_s3_list_buckets: tool({
      description: "S3 ListBuckets — every S3 bucket in the account.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = "aws s3api list-buckets";
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_s3_list_buckets",
          tool_input: { command: cmd },
        });
        const client = new S3Client(awsConfig(ctx.creds));
        const out = await client.send(new ListBucketsCommand({}));
        const result = {
          Buckets: (out.Buckets ?? []).map((b) => ({ Name: b.Name, CreationDate: b.CreationDate })),
        };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_s3_list_buckets",
          tool_output: { command: cmd, result: summarize(result) },
        });
        return result;
      },
    }),
    aws_s3_get_public_access_block: tool({
      description:
        "S3 GetPublicAccessBlock — account-level public access block configuration for a bucket. Missing config means public access IS NOT blocked.",
      inputSchema: z.object({ bucket: z.string() }),
      execute: async ({ bucket }) => {
        const cmd = `aws s3api get-public-access-block --bucket ${bucket}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_s3_get_public_access_block",
          tool_input: { command: cmd, bucket },
        });
        const client = new S3Client(awsConfig(ctx.creds));
        try {
          const out = await client.send(new GetPublicAccessBlockCommand({ Bucket: bucket }));
          const result = { PublicAccessBlockConfiguration: out.PublicAccessBlockConfiguration };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_public_access_block",
            tool_output: { command: cmd, result },
          });
          return result;
        } catch (e: unknown) {
          const err = e as { name?: string; message?: string };
          const result = { error: err.name ?? "Error", message: err.message };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_public_access_block",
            tool_output: { command: cmd, result },
          });
          return result;
        }
      },
    }),
    aws_s3_get_bucket_encryption: tool({
      description: "S3 GetBucketEncryption — default SSE configuration for a bucket.",
      inputSchema: z.object({ bucket: z.string() }),
      execute: async ({ bucket }) => {
        const cmd = `aws s3api get-bucket-encryption --bucket ${bucket}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_s3_get_bucket_encryption",
          tool_input: { command: cmd, bucket },
        });
        const client = new S3Client(awsConfig(ctx.creds));
        try {
          const out = await client.send(new GetBucketEncryptionCommand({ Bucket: bucket }));
          const result = {
            ServerSideEncryptionConfiguration: out.ServerSideEncryptionConfiguration,
          };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_bucket_encryption",
            tool_output: { command: cmd, result },
          });
          return result;
        } catch (e: unknown) {
          const err = e as { name?: string; message?: string };
          const result = { error: err.name ?? "Error", message: err.message };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_bucket_encryption",
            tool_output: { command: cmd, result },
          });
          return result;
        }
      },
    }),
    aws_s3_get_bucket_policy_status: tool({
      description:
        "S3 GetBucketPolicyStatus — IsPublic flag indicating the bucket policy makes it public.",
      inputSchema: z.object({ bucket: z.string() }),
      execute: async ({ bucket }) => {
        const cmd = `aws s3api get-bucket-policy-status --bucket ${bucket}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_s3_get_bucket_policy_status",
          tool_input: { command: cmd, bucket },
        });
        const client = new S3Client(awsConfig(ctx.creds));
        try {
          const out = await client.send(new GetBucketPolicyStatusCommand({ Bucket: bucket }));
          const result = { PolicyStatus: out.PolicyStatus };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_bucket_policy_status",
            tool_output: { command: cmd, result },
          });
          return result;
        } catch (e: unknown) {
          const err = e as { name?: string; message?: string };
          const result = { error: err.name ?? "Error", message: err.message };
          await logStep(ctx, {
            kind: "tool_result",
            tool_name: "aws_s3_get_bucket_policy_status",
            tool_output: { command: cmd, result },
          });
          return result;
        }
      },
    }),
    aws_s3_get_bucket_location: tool({
      description: "S3 GetBucketLocation — the region the bucket lives in.",
      inputSchema: z.object({ bucket: z.string() }),
      execute: async ({ bucket }) => {
        const cmd = `aws s3api get-bucket-location --bucket ${bucket}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_s3_get_bucket_location",
          tool_input: { command: cmd, bucket },
        });
        const client = new S3Client(awsConfig(ctx.creds));
        const out = await client.send(new GetBucketLocationCommand({ Bucket: bucket }));
        const result = { LocationConstraint: out.LocationConstraint ?? "us-east-1" };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_s3_get_bucket_location",
          tool_output: { command: cmd, result },
        });
        return result;
      },
    }),
    report_finding: tool({
      description: "Record a security finding for the scan report.",
      inputSchema: z.object({
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        title: z.string(),
        description: z.string().optional(),
        resource: z.string().optional(),
      }),
      execute: async ({ severity, title, description, resource }) => {
        await addFinding(ctx, { severity, title, description, resource });
        return { ok: true };
      },
    }),
  };
}

function makeEc2Tools(ctx: RunCtx) {
  return {
    aws_ec2_describe_security_groups: tool({
      description:
        "EC2 DescribeSecurityGroups — security groups in the configured region. Look for 0.0.0.0/0 ingress.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = `aws ec2 describe-security-groups --region ${ctx.creds.region}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_ec2_describe_security_groups",
          tool_input: { command: cmd },
        });
        const client = new EC2Client(awsConfig(ctx.creds));
        const out = await client.send(new DescribeSecurityGroupsCommand({}));
        const result = {
          SecurityGroups: (out.SecurityGroups ?? []).slice(0, 50).map((g) => ({
            GroupId: g.GroupId,
            GroupName: g.GroupName,
            VpcId: g.VpcId,
            Description: g.Description,
            IpPermissions: g.IpPermissions,
          })),
        };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_ec2_describe_security_groups",
          tool_output: { command: cmd, result: summarize(result, 4000) },
        });
        return result;
      },
    }),
    aws_ec2_describe_instances: tool({
      description:
        "EC2 DescribeInstances — running compute in the configured region, including public IPs.",
      inputSchema: z.object({}),
      execute: async () => {
        const cmd = `aws ec2 describe-instances --region ${ctx.creds.region}`;
        await logStep(ctx, {
          kind: "tool_call",
          tool_name: "aws_ec2_describe_instances",
          tool_input: { command: cmd },
        });
        const client = new EC2Client(awsConfig(ctx.creds));
        const out = await client.send(new DescribeInstancesCommand({}));
        const instances = (out.Reservations ?? []).flatMap((r) =>
          (r.Instances ?? []).map((i) => ({
            InstanceId: i.InstanceId,
            State: i.State?.Name,
            InstanceType: i.InstanceType,
            PublicIpAddress: i.PublicIpAddress,
            PrivateIpAddress: i.PrivateIpAddress,
            SecurityGroups: i.SecurityGroups,
          })),
        );
        const result = { Instances: instances };
        await logStep(ctx, {
          kind: "tool_result",
          tool_name: "aws_ec2_describe_instances",
          tool_output: { command: cmd, result: summarize(result, 4000) },
        });
        return result;
      },
    }),
    report_finding: tool({
      description: "Record a security finding for the scan report.",
      inputSchema: z.object({
        severity: z.enum(["info", "low", "medium", "high", "critical"]),
        title: z.string(),
        description: z.string().optional(),
        resource: z.string().optional(),
      }),
      execute: async ({ severity, title, description, resource }) => {
        await addFinding(ctx, { severity, title, description, resource });
        return { ok: true };
      },
    }),
  };
}

// ─── System prompts ────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<BuiltinAgentType, string> = {
  recon: `You are the RECON agent inside Cirrus, an autonomous AWS pentest platform.
Your job: confirm the identity of the credentials, list enabled regions, fetch the account summary, and surface high-level posture issues.

Rules:
- Use the available tools. Do not invent data.
- Before each tool call, write ONE short sentence of reasoning explaining why.
- Call report_finding for anything notable (e.g. root account has access keys, MFA not enabled on root, very high user counts).
- When done, write a 1-paragraph summary covering: AWS account ID, alias, IAM ARN you authenticated as, number of enabled regions, and any posture concerns. Then STOP.`,

  iam: `You are the IAM AUDITOR agent inside Cirrus, an autonomous AWS pentest platform.
Your job: enumerate IAM users and roles, inspect attached policies, and flag privilege issues.

Rules:
- Start by listing users and roles.
- For up to 5 of the most interesting users, list their attached policies and their access keys.
- For up to 5 of the most interesting roles, list their attached policies.
- Flag findings such as:
  * AdministratorAccess attached to a user (HIGH/CRITICAL)
  * Access keys older than 90 days or never-rotated (MEDIUM)
  * Users with console access but no recent login (LOW)
  * Wildcard / dangerous managed policies (HIGH)
- Before each tool call, write ONE sentence of reasoning.
- Use report_finding for each issue.
- End with a 1-paragraph summary, then STOP.`,

  s3: `You are the S3 HUNTER agent inside Cirrus, an autonomous AWS pentest platform.
Your job: enumerate S3 buckets and find ones that are publicly exposed, unencrypted, or unprotected.

Rules:
- Start by listing all buckets.
- For each bucket (up to 8), check: public access block, bucket policy status, encryption.
- Flag findings:
  * Missing or disabled public access block (HIGH)
  * IsPublic=true bucket policy (CRITICAL)
  * No default encryption (MEDIUM)
- Before each tool call, write ONE sentence of reasoning.
- Use report_finding for each issue.
- End with a 1-paragraph summary, then STOP.`,

  ec2: `You are the EC2 / NETWORK agent inside Cirrus, an autonomous AWS pentest platform.
Your job: inspect security groups and instances in the configured region for over-exposure.

Rules:
- List security groups; identify any with 0.0.0.0/0 or ::/0 on sensitive ports (22, 3389, 3306, 5432, 6379, 9200, 27017, etc.).
- List instances; correlate public IPs with risky security groups.
- Flag findings:
  * SSH (22) open to the world (HIGH)
  * RDP (3389) open to the world (HIGH)
  * Database port open to the world (CRITICAL)
  * All-ports open to the world (CRITICAL)
  * Running instance with public IP + risky SG (HIGH)
- Before each tool call, write ONE sentence of reasoning.
- Use report_finding for each issue.
- End with a 1-paragraph summary, then STOP.`,
};

// ─── Public entry point ────────────────────────────────────────────────────

// Build a custom-agent toolset by merging all read-only AWS tools, filtered
// by an allowed-services whitelist. Tool names are prefixed `aws_<service>_`.
function makeCustomTools(ctx: RunCtx, services: AwsService[]) {
  const all = {
    ...makeReconTools(ctx),
    ...makeIamTools(ctx),
    ...makeS3Tools(ctx),
    ...makeEc2Tools(ctx),
  } as Record<string, unknown>;
  const allowed = new Set(services);
  const filtered: Record<string, unknown> = { report_finding: all.report_finding };
  for (const [name, t] of Object.entries(all)) {
    if (name === "report_finding") continue;
    const m = /^aws_([^_]+)_/.exec(name);
    if (m && allowed.has(m[1] as AwsService)) filtered[name] = t;
  }
  return filtered as ToolSet;
}

export interface CustomAgentConfig {
  id: string;
  name: string;
  description?: string | null;
  system_prompt: string;
  services: string[];
}

export async function runAgent(params: {
  supabase: SupabaseClient;
  scanId: string;
  agentRunId: string;
  agentType: AgentType;
  creds: AwsCredsInput;
  apiKey: string;
  customAgent?: CustomAgentConfig | null;
}): Promise<{ summary: string }> {
  const { supabase, scanId, agentRunId, agentType, creds, apiKey, customAgent } = params;
  const ctx: RunCtx = { supabase, scanId, agentRunId, creds, stepCounter: { i: 0 } };

  await supabase
    .from("agent_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", agentRunId);

  let tools: ToolSet;
  let system: string;
  if (agentType === "custom") {
    if (!customAgent) throw new Error("Custom agent config missing");
    const services = (customAgent.services ?? []).filter((s): s is AwsService =>
      ["sts", "iam", "s3", "ec2"].includes(s),
    );
    tools = makeCustomTools(ctx, services);
    system = `You are "${customAgent.name}", a user-defined custom agent inside Cirrus, an autonomous AWS pentest platform.

User-provided instructions:
${customAgent.system_prompt}

Rules:
- Use only the AWS tools available to you (restricted to: ${services.join(", ") || "none"}).
- Before each tool call, write ONE short sentence of reasoning explaining why.
- Call report_finding for anything risky, with an appropriate severity.
- When done, write a 1-paragraph summary, then STOP.`;
  } else {
    tools =
      agentType === "recon"
        ? makeReconTools(ctx)
        : agentType === "iam"
          ? makeIamTools(ctx)
          : agentType === "s3"
            ? makeS3Tools(ctx)
            : makeEc2Tools(ctx);
    system = SYSTEM_PROMPTS[agentType];
  }

  const gateway = createLovableAiGatewayProvider(apiKey);
  const model = gateway("google/gemini-3-flash-preview");

  try {
    const { text } = await generateText({
      model,
      system,
      prompt: `Begin your scan now. AWS region: ${creds.region}.`,
      tools,
      stopWhen: stepCountIs(50),
      onStepFinish: async ({ text: stepText }) => {
        if (stepText && stepText.trim().length > 0) {
          await logStep(ctx, { kind: "thought", thought: stepText.trim() });
        }
      },
    });
    await logStep(ctx, { kind: "final", thought: text });
    await supabase
      .from("agent_runs")
      .update({ status: "complete", summary: text, completed_at: new Date().toISOString() })
      .eq("id", agentRunId);
    return { summary: text };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[cirrus] agent ${agentType} failed`, err);
    await logStep(ctx, { kind: "final", error: message });
    await supabase
      .from("agent_runs")
      .update({
        status: "error",
        summary: `Error: ${message}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", agentRunId);
    return { summary: `Error: ${message}` };
  }
}

