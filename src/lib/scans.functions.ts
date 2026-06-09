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

    // Verify scan ownership.
    const { data: scan, error: scanErr } = await supabase
      .from("scans")
      .select("id, user_id, selected_agents, status")
      .eq("id", scanId)
      .eq("user_id", userId)
      .single();
    if (scanErr || !scan) throw new Error("Scan not found");
    if (scan.status !== "pending") {
      return { ok: true, alreadyRunning: true };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    await supabase
      .from("scans")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", scanId);

    const { data: runs, error: runsErr } = await supabase
      .from("agent_runs")
      .select("id, agent_type")
      .eq("scan_id", scanId)
      .order("created_at", { ascending: true });
    if (runsErr || !runs) throw new Error("Agent runs not found");

    // Dynamic import keeps server-only AWS SDK chain out of client bundles.
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
          }),
        ),
      );
      await supabase
        .from("scans")
        .update({ status: "complete", completed_at: new Date().toISOString() })
        .eq("id", scanId);
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
