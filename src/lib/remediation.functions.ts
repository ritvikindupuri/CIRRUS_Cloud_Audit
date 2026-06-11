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

    await supabase
      .from("remediation_deployments")
      .update({
        executed: true,
        executed_at: new Date().toISOString(),
        status: ok ? "applied" : "failed",
        change_set_status: stackStatus,
        error_message: ok ? null : reason,
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
    await supabase
      .from("remediation_deployments")
      .update({
        rolled_back: ok,
        rolled_back_at: ok ? new Date().toISOString() : null,
        status: ok ? "rolled_back" : "rollback_failed",
        change_set_status: stackStatus,
        error_message: ok ? null : reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", dep.id);

    return { ok, status: stackStatus, reason };
  });
