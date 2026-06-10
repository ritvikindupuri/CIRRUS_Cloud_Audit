// Server functions for scan lifecycle. Client invokes these; AWS keys flow
// through per-request and are NEVER persisted on the server.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AgentType } from "@/lib/agents/definitions";

const AwsCredsSchema = z.object({
  accessKeyId: z.string().min(16).max(128),
  secretAccessKey: z.string().min(20).max(256),
  sessionToken: z.string().max(4096).optional(),
  region: z.string().min(2).max(64),
});

const StartScanInput = z.object({
  scanId: z.string().uuid(),
  creds: AwsCredsSchema,
});

export const runScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StartScanInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { scanId, creds } = data;

    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .select("id, user_id, selected_agents, status, custom_agent_ids")
      .eq("id", scanId)
      .eq("user_id", userId)
      .single();
    if (scanErr || !scan) throw new Error("Scan not found");
    if (scan.status !== "pending") return { ok: true, alreadyRunning: true };

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    await supabase
      .from("scans")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", scanId);

    const { data: runs, error: runsErr } = await supabase
      .from("agent_runs")
      .select("id, agent_type, custom_agent_id")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });
    if (runsErr || !runs) throw new Error("Agent runs not found");

    // Load any custom agent configs referenced by this scan's runs.
    const customIds = runs.map((r) => r.custom_agent_id).filter((x): x is string => !!x);
    const customMap = new Map<string, { id: string; name: string; description: string | null; system_prompt: string; services: string[] }>();
    if (customIds.length > 0) {
      const { data: customs } = await supabase
        .from("custom_agents")
        .select("id, name, description, system_prompt, services")
        .in("id", customIds);
      for (const c of customs ?? []) customMap.set(c.id, c);
    }

    const { runAgent } = await import("@/lib/agents/runner.server");

    try {
      await Promise.all(
        runs.map((r) =>
          runAgent({
            supabase,
            scanId,
            agentRunId: r.id,
            agentType: r.agent_type as AgentType,
            creds,
            apiKey,
            customAgent: r.custom_agent_id ? customMap.get(r.custom_agent_id) ?? null : null,
          }),
        ),
      );
      await supabase
        .from("scans")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", scanId);

      // If this scan is part of a schedule, advance next_run_at.
      const { data: full } = await supabase
        .from("scans")
        .select("scheduled_scan_id")
        .eq("id", scanId)
        .single();
      if (full?.scheduled_scan_id) {
        const { data: sched } = await supabase
          .from("scheduled_scans")
          .select("cadence_days")
          .eq("id", full.scheduled_scan_id)
          .single();
        const days = sched?.cadence_days ?? 7;
        const next = new Date(Date.now() + days * 86400_000).toISOString();
        await supabase
          .from("scheduled_scans")
          .update({ last_run_scan_id: scanId, next_run_at: next })
          .eq("id", full.scheduled_scan_id);
      }

      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await supabase
        .from("scans")
        .update({ status: "error", error_message: message, completed_at: new Date().toISOString() })
        .eq("id", scanId);
      return { ok: false, error: message };
    }
  });

// ── Remediation playbook generation ─────────────────────────────────────────
const RemediationInput = z.object({ findingId: z.string().uuid() });

export interface Remediation {
  explanation: string;
  cli: string;
  cloudformation: string;
  rollback: string;
}

export const generateRemediation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RemediationInput.parse(input))
  .handler(async ({ data, context }): Promise<Remediation> => {
    const { supabase, userId } = context;

    const { data: finding } = await supabase
      .from("findings")
      .select("id, severity, title, description, resource, scan_id, remediation")
      .eq("id", data.findingId)
      .single();
    if (!finding) throw new Error("Finding not found");

    const { data: scan } = await supabase
      .from("scans")
      .select("user_id, region")
      .eq("id", finding.scan_id)
      .single();
    if (!scan || scan.user_id !== userId) throw new Error("Not authorized");

    if (finding.remediation) return finding.remediation as unknown as Remediation;

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { generateText } = await import("ai");
    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(apiKey);
    const model = gateway("google/gemini-3-flash-preview");

    const prompt = `Generate a remediation playbook for this AWS security finding.

Severity: ${finding.severity}
Title: ${finding.title}
Resource: ${finding.resource ?? "n/a"}
Region: ${scan.region}
Description: ${finding.description ?? "n/a"}

Respond with ONLY valid JSON in this exact shape (no markdown, no backticks):
{
  "explanation": "1-3 sentence plain-English explanation of risk and fix",
  "cli": "ready-to-run AWS CLI command(s), one per line",
  "cloudformation": "minimal CloudFormation YAML snippet that applies the fix",
  "rollback": "1-2 lines on how to undo if it breaks something"
}`;

    const { text } = await generateText({ model, prompt });
    let parsed: Remediation;
    try {
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const obj = JSON.parse(cleaned);
      parsed = {
        explanation: String(obj.explanation ?? ""),
        cli: String(obj.cli ?? ""),
        cloudformation: String(obj.cloudformation ?? ""),
        rollback: String(obj.rollback ?? ""),
      };
    } catch {
      parsed = { explanation: text, cli: "", cloudformation: "", rollback: "" };
    }

    await supabase
      .from("findings")
      .update({ remediation: parsed as unknown as never })
      .eq("id", finding.id);
    return parsed;
  });

// ── Scheduled drift detection — launch a run from a saved schedule ──────────
const RunScheduledInput = z.object({
  scheduleId: z.string().uuid(),
  creds: AwsCredsSchema,
});

export const runScheduledScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RunScheduledInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sched } = await supabase
      .from("scheduled_scans")
      .select("*")
      .eq("id", data.scheduleId)
      .eq("user_id", userId)
      .single();
    if (!sched) throw new Error("Schedule not found");

    const parentScanId = sched.last_run_scan_id as string | null;

    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .insert({
        user_id: userId,
        name: `${sched.name} (drift check)`,
        region: sched.region,
        status: "pending",
        selected_agents: sched.selected_agents,
        custom_agent_ids: sched.custom_agent_ids,
        scheduled_scan_id: sched.id,
        parent_scan_id: parentScanId,
      })
      .select("id")
      .single();
    if (scanErr || !scan) throw scanErr ?? new Error("Failed to create scan");

    const positions = [
      { x: 0, y: 0 }, { x: 320, y: -120 }, { x: 320, y: 120 }, { x: 640, y: 0 },
      { x: 640, y: -200 }, { x: 640, y: 200 }, { x: 960, y: 0 },
    ];
    const builtinRuns = (sched.selected_agents as string[]).map((agent_type, i) => ({
      scan_id: scan.id,
      agent_type,
      status: "pending",
      position_x: positions[i % positions.length].x,
      position_y: positions[i % positions.length].y,
      custom_agent_id: null as string | null,
    }));
    const customRuns = (sched.custom_agent_ids as string[]).map((id, i) => {
      const p = positions[(builtinRuns.length + i) % positions.length];
      return {
        scan_id: scan.id,
        agent_type: "custom",
        status: "pending",
        position_x: p.x,
        position_y: p.y,
        custom_agent_id: id,
      };
    });
    await supabase.from("agent_runs").insert([...builtinRuns, ...customRuns]);

    // Fire async; client polls/realtime.
    void runScan({ data: { scanId: scan.id, creds: data.creds } });

    return { scanId: scan.id };
  });
