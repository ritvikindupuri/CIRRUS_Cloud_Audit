// Server functions for the one-click CloudFormation remediation flow:
// 1. createDryRunChangeSet — synth a CFN template + change set without applying.
// 2. executeRemediation — execute the change set to apply the fix.
// 3. rollbackRemediation — delete the Cirrus-created stack to undo the fix.
// AWS credentials are passed per-request from the browser and never persisted.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AwsCredsSchema = z.object({
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(20).max(256),
  sessionToken: z.string().max(4096).optional(),
  region: z.string().min(2).max(64),
});

const DryRunInput = z.object({
  findingId: z.string().uuid(),
  creds: AwsCredsSchema,
});

function stackNameFor(findingId: string) {
  return `cirrus-fix-${findingId.replace(/-/g, "").slice(0, 24)}`;
}

async function cfnClient(creds: z.infer<typeof AwsCredsSchema>) {
  const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
  return new CloudFormationClient({
    region: creds.region,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
      sessionToken: creds.sessionToken,
    },
  });
}

export const createDryRunChangeSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DryRunInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { findingId, creds } = data;

    const { data: finding } = await supabase
      .from("findings")
      .select("id, scan_id, remediation, title")
      .eq("id", findingId)
      .single();
    if (!finding) throw new Error("Finding not found");
    const remediation = finding.remediation as { cloudformation?: string } | null;
    if (!remediation?.cloudformation?.trim()) {
      throw new Error("No CloudFormation template — generate a playbook first.");
    }

    const { data: scan } = await supabase
      .from("scans")
      .select("user_id, region")
      .eq("id", finding.scan_id)
      .single();
    if (!scan || scan.user_id !== userId) throw new Error("Not authorized");

    const template = remediation.cloudformation;
    const stackName = stackNameFor(findingId);
    const changeSetName = `cirrus-${Date.now()}`;

    const { CreateChangeSetCommand, DescribeStacksCommand } = await import(
      "@aws-sdk/client-cloudformation"
    );
    const client = await cfnClient(creds);

    // Detect whether the stack already exists, decide CREATE vs UPDATE.
    let exists = false;
    try {
      const out = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      exists = (out.Stacks?.length ?? 0) > 0;
    } catch {
      exists = false;
    }

    const created = await client.send(
      new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: changeSetName,
        ChangeSetType: exists ? "UPDATE" : "CREATE",
        TemplateBody: template,
        Capabilities: ["CAPABILITY_NAMED_IAM", "CAPABILITY_AUTO_EXPAND"],
        Description: `Cirrus remediation for finding ${findingId} — ${finding.title}`,
      }),
    );

    // Poll until change set leaves CREATE_PENDING / CREATE_IN_PROGRESS.
    const { DescribeChangeSetCommand: DescribeChangeSetCmd } = await import(
      "@aws-sdk/client-cloudformation"
    );
    type DescribeOut = import("@aws-sdk/client-cloudformation").DescribeChangeSetCommandOutput;
    let described: DescribeOut | null = null;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      described = (await client.send(
        new DescribeChangeSetCmd({ ChangeSetName: created.Id! }),
      )) as DescribeOut;
      const status = described.Status;
      if (
        status === "CREATE_COMPLETE" ||
        status === "FAILED" ||
        status === "DELETE_COMPLETE"
      )
        break;
    }

    const status = described?.Status ?? "UNKNOWN";
    const changes = (described?.Changes ?? []).map((c) => ({
      type: c.Type,
      action: c.ResourceChange?.Action,
      logicalResourceId: c.ResourceChange?.LogicalResourceId,
      resourceType: c.ResourceChange?.ResourceType,
      replacement: c.ResourceChange?.Replacement,
    }));

    // Fetch current CloudFormation events for audit logging
    const { DescribeStackEventsCommand } = await import("@aws-sdk/client-cloudformation");
    let cfnEvents: unknown[] = [];
    try {
      const eventsOut = await client.send(new DescribeStackEventsCommand({ StackName: stackName }));
      cfnEvents = (eventsOut.StackEvents ?? []).map((ev) => ({
        timestamp: ev.Timestamp?.toISOString() || new Date().toISOString(),
        logicalId: ev.LogicalResourceId || "",
        physicalId: ev.PhysicalResourceId || "",
        type: ev.ResourceType || "",
        status: ev.ResourceStatus || "",
        reason: ev.ResourceStatusReason || "",
      }));
    } catch {
      // Ignored if stack doesn't exist yet
    }

    const { data: dep, error } = await supabase
      .from("remediation_deployments")
      .insert({
        user_id: userId,
        finding_id: findingId,
        scan_id: finding.scan_id,
        region: creds.region,
        stack_name: stackName,
        stack_id: described?.StackId ?? null,
        change_set_id: created.Id ?? null,
        change_set_name: changeSetName,
        change_set_status: status,
        change_set_changes: changes,
        template_yaml: template,
        status: status === "FAILED" ? "change_set_failed" : "dry_run",
        error_message: status === "FAILED" ? described?.StatusReason ?? null : null,
        cfn_events: cfnEvents as any,
      })
      .select("*")
      .single();
    if (error) throw error;

    return {
      deploymentId: dep.id,
      status,
      reason: described?.StatusReason ?? null,
      changes,
    };
  });

const ExecuteInput = z.object({
  deploymentId: z.string().uuid(),
  creds: AwsCredsSchema,
});

export const executeRemediation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ExecuteInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: dep } = await supabase
      .from("remediation_deployments")
      .select("*")
      .eq("id", data.deploymentId)
      .eq("user_id", userId)
      .single();
    if (!dep) throw new Error("Deployment not found");
    if (!dep.change_set_id) throw new Error("No change set on this deployment");
    if (dep.executed) throw new Error("Already executed");

    const { ExecuteChangeSetCommand, DescribeStacksCommand } = await import(
      "@aws-sdk/client-cloudformation"
    );
    const client = await cfnClient(data.creds);

    await client.send(
      new ExecuteChangeSetCommand({ ChangeSetName: dep.change_set_id }),
    );

    // Poll stack until terminal.
    let stackStatus = "UPDATE_IN_PROGRESS";
    let reason: string | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const out = await client.send(
          new DescribeStacksCommand({ StackName: dep.stack_name }),
        );
        const s = out.Stacks?.[0];
        stackStatus = s?.StackStatus ?? stackStatus;
        reason = s?.StackStatusReason ?? null;
        if (
          stackStatus.endsWith("_COMPLETE") ||
          stackStatus.endsWith("_FAILED") ||
          stackStatus === "ROLLBACK_COMPLETE"
        )
          break;
      } catch (e) {
        reason = e instanceof Error ? e.message : String(e);
        break;
      }
    }

    const ok =
      stackStatus === "CREATE_COMPLETE" || stackStatus === "UPDATE_COMPLETE";

    // Fetch final CloudFormation events for audit logging
    const { DescribeStackEventsCommand } = await import("@aws-sdk/client-cloudformation");
    let cfnEvents: unknown[] = [];
    try {
      const eventsOut = await client.send(new DescribeStackEventsCommand({ StackName: dep.stack_name }));
      cfnEvents = (eventsOut.StackEvents ?? []).map((ev) => ({
        timestamp: ev.Timestamp?.toISOString() || new Date().toISOString(),
        logicalId: ev.LogicalResourceId || "",
        physicalId: ev.PhysicalResourceId || "",
        type: ev.ResourceType || "",
        status: ev.ResourceStatus || "",
        reason: ev.ResourceStatusReason || "",
      }));
    } catch (e) {
      console.warn("[remediation] Failed to fetch stack events for audit logs", e);
    }

    await supabase
      .from("remediation_deployments")
      .update({
        executed: true,
        executed_at: new Date().toISOString(),
        status: ok ? "applied" : "failed",
        change_set_status: stackStatus,
        error_message: ok ? null : reason,
        cfn_events: cfnEvents as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dep.id);

    return { ok, status: stackStatus, reason };
  });

const RollbackInput = z.object({
  deploymentId: z.string().uuid(),
  creds: AwsCredsSchema,
});

export const rollbackRemediation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RollbackInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: dep } = await supabase
      .from("remediation_deployments")
      .select("*")
      .eq("id", data.deploymentId)
      .eq("user_id", userId)
      .single();
    if (!dep) throw new Error("Deployment not found");
    if (!dep.executed) throw new Error("Nothing to roll back — fix was not applied");
    if (dep.rolled_back) throw new Error("Already rolled back");

    const { DeleteStackCommand, DescribeStacksCommand } = await import(
      "@aws-sdk/client-cloudformation"
    );
    const client = await cfnClient(data.creds);

    await client.send(new DeleteStackCommand({ StackName: dep.stack_name }));

    let stackStatus: string | null = "DELETE_IN_PROGRESS";
    let reason: string | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const out = await client.send(
          new DescribeStacksCommand({ StackName: dep.stack_name }),
        );
        const s = out.Stacks?.[0];
        stackStatus = s?.StackStatus ?? stackStatus;
        reason = s?.StackStatusReason ?? null;
        if (stackStatus === "DELETE_FAILED") break;
      } catch {
        // Stack gone — delete succeeded.
        stackStatus = "DELETE_COMPLETE";
        break;
      }
    }

    const ok = stackStatus === "DELETE_COMPLETE";

    // Fetch final CloudFormation events for audit logging
    const { DescribeStackEventsCommand } = await import("@aws-sdk/client-cloudformation");
    let cfnEvents: unknown[] = [];
    try {
      const eventsOut = await client.send(new DescribeStackEventsCommand({ StackName: dep.stack_name }));
      cfnEvents = (eventsOut.StackEvents ?? []).map((ev) => ({
        timestamp: ev.Timestamp?.toISOString() || new Date().toISOString(),
        logicalId: ev.LogicalResourceId || "",
        physicalId: ev.PhysicalResourceId || "",
        type: ev.ResourceType || "",
        status: ev.ResourceStatus || "",
        reason: ev.ResourceStatusReason || "",
      }));
    } catch (e) {
      console.warn("[remediation] Failed to fetch stack events for audit logs during rollback", e);
    }

    await supabase
      .from("remediation_deployments")
      .update({
        rolled_back: ok,
        rolled_back_at: ok ? new Date().toISOString() : null,
        status: ok ? "rolled_back" : "rollback_failed",
        change_set_status: stackStatus,
        error_message: ok ? null : reason,
        cfn_events: cfnEvents as any,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dep.id);

    return { ok, status: stackStatus, reason };
  });

// Attempts to self-grant the CloudFormation permissions Cirrus needs on the
// caller's IAM principal so the user doesn't have to paste a JSON policy into
// the AWS Console. Works only when the credentials belong to an IAM user AND
// already have iam:PutUserPolicy (e.g. a power-user / admin key). For an
// assumed-role / SSO / federated principal it cannot self-grant and surfaces
// a clear message instead.
const BootstrapInput = z.object({ creds: AwsCredsSchema });

const CIRRUS_POLICY_NAME = "CirrusRemediationAccess";
const CIRRUS_POLICY_DOC = JSON.stringify({
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Action: [
        "iam:PutUserPolicy",
        "iam:DeleteUserPolicy",
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy",
        "iam:PassRole",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "s3:CreateBucket",
        "s3:PutBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
        "s3:PutEncryptionConfiguration",
        "s3:PutBucketEncryption",
        "s3:PutBucketVersioning",
        "s3:PutLifecycleConfiguration",
        "ec2:CreateSecurityGroup",
        "ec2:DeleteSecurityGroup",
        "ec2:AuthorizeSecurityGroupIngress",
        "ec2:RevokeSecurityGroupIngress",
        "ec2:AuthorizeSecurityGroupEgress",
        "ec2:RevokeSecurityGroupEgress",
        "ec2:ModifySecurityGroupRules",
        "rds:ModifyDBInstance",
        "rds:ModifyDBCluster",
        "rds:ModifyOptionGroup",
        "rds:ModifyDBParameterGroup",
        "lambda:UpdateFunctionConfiguration",
        "lambda:UpdateFunctionCode",
        "lambda:PutFunctionConcurrency",
        "dynamodb:UpdateTable",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "kms:CreateKey",
        "kms:UpdateKeyDescription",
        "kms:EnableKey",
        "kms:DisableKey",
        "kms:PutKeyPolicy",
        "cloudtrail:CreateTrail",
        "cloudtrail:UpdateTrail",
        "cloudtrail:StartLogging",
        "cloudtrail:StopLogging",
        "cloudtrail:DeleteTrail"
      ],
      "Resource": "*",
    },
  ],
});

export const bootstrapRemediationPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => BootstrapInput.parse(input))
  .handler(async ({ data }) => {
    const { creds } = data;
    const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
    const sts = new STSClient({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
    const id = await sts.send(new GetCallerIdentityCommand({}));
    const arn = id.Arn ?? "";
    // arn:aws:iam::123:user/Name  vs  arn:aws:sts::123:assumed-role/...
    const userMatch = arn.match(/:user\/(.+)$/);
    if (!userMatch) {
      return {
        ok: false,
        principal: arn,
        reason:
          "Your credentials are an assumed role or federated identity. Cirrus can only self-grant on a long-lived IAM user. Ask your admin to attach the CloudFormation policy shown in the docs, or rescan with an IAM user key.",
      };
    }
    const userName = decodeURIComponent(userMatch[1]);
    const { IAMClient, PutUserPolicyCommand } = await import("@aws-sdk/client-iam");
    const iam = new IAMClient({
      region: creds.region,
      credentials: {
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
      },
    });
    try {
      await iam.send(
        new PutUserPolicyCommand({
          UserName: userName,
          PolicyName: CIRRUS_POLICY_NAME,
          PolicyDocument: CIRRUS_POLICY_DOC,
        }),
      );
      return {
        ok: true,
        principal: arn,
        userName,
        reason: `Attached inline policy ${CIRRUS_POLICY_NAME} to IAM user ${userName}. Changes propagate in a few seconds.`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        principal: arn,
        userName,
        reason: `Could not self-grant: ${msg}. Your scan credentials need iam:PutUserPolicy, or an admin must attach the policy manually.`,
      };
    }
  });
