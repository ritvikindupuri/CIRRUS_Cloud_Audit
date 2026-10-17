// Audit logging utility for privileged actions
// Logs to append-only audit_log table via service role
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRequest } from "@tanstack/react-start/server";

export async function logAuditEvent(params: {
  userId: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    // Use service role client to bypass RLS
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Extract IP and user agent from request if available
    let ipAddress: string | null = null;
    let userAgent: string | null = null;

    try {
      const request = getRequest();
      if (request) {
        ipAddress =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-real-ip") ||
          request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
          null;
        userAgent = request.headers.get("user-agent");
      }
    } catch {
      // Request not available in this context
    }

    await supabaseAdmin.from("audit_log").insert({
      user_id: params.userId,
      action: params.action,
      resource_type: params.resourceType ?? null,
      resource_id: params.resourceId ?? null,
      metadata: params.metadata ?? {},
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    console.log(
      `[AUDIT] ${params.action} by user ${params.userId} on ${params.resourceType}:${params.resourceId}`,
    );
  } catch (error) {
    // Audit logging should never break the application
    console.error("[AUDIT] Failed to log audit event:", error);
  }
}
