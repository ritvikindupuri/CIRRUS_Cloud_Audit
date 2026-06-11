import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Copy, ChevronDown, Loader2, Play, Undo2, ShieldCheck, AlertTriangle } from "lucide-react";
import { generateRemediation } from "@/lib/scans.functions";
import {
  createDryRunChangeSet,
  executeRemediation,
  rollbackRemediation,
  bootstrapRemediationPermissions,
} from "@/lib/remediation.functions";
import { loadCreds } from "@/lib/aws-creds";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Finding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
  remediation?: Record<string, unknown> | null;
}

interface Deployment {
  id: string;
  finding_id: string;
  status: string;
  stack_name: string;
  change_set_status: string | null;
  change_set_changes: unknown;
  executed: boolean;
  rolled_back: boolean;
  error_message: string | null;
  created_at: string;
}

const SEV_CLASS: Record<Finding["severity"], string> = {
  info: "border-severity-info/40 text-severity-info",
  low: "border-severity-low/40 text-severity-low",
  medium: "border-severity-medium/40 text-severity-medium",
  high: "border-severity-high/40 text-severity-high",
  critical: "border-severity-critical/40 text-severity-critical bg-severity-critical/10",
};

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
        No findings yet. Agents report findings as they run.
      </div>
    );
  }
  const sortOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = [...findings].sort((a, b) => sortOrder[a.severity] - sortOrder[b.severity]);
  return (
    <div className="space-y-2">
      {sorted.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </div>
  );
}

function FindingCard({ finding: f }: { finding: Finding }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [remediation, setRemediation] = useState<Record<string, unknown> | null>(
    f.remediation ?? null,
  );
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [cfnBusy, setCfnBusy] = useState<"dry" | "apply" | "rollback" | null>(null);

  useEffect(() => {
    void supabase
      .from("remediation_deployments")
      .select("*")
      .eq("finding_id", f.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setDeployment((data ?? null) as Deployment | null));
  }, [f.id]);

  async function load() {
    if (remediation) {
      setOpen((v) => !v);
      return;
    }
    setLoading(true);
    try {
      const r = await generateRemediation({ data: { findingId: f.id } });
      setRemediation(r as unknown as Record<string, unknown>);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate playbook");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast.success("Copied");
  }

  async function runDryRunOnce(creds: NonNullable<ReturnType<typeof loadCreds>>) {
    const r = await createDryRunChangeSet({ data: { findingId: f.id, creds } });
    toast.success(`Change set ${r.status} · ${r.changes.length} change(s)`);
    const { data } = await supabase
      .from("remediation_deployments")
      .select("*")
      .eq("id", r.deploymentId)
      .single();
    setDeployment(data as Deployment);
  }

  async function dryRun() {
    const creds = loadCreds();
    if (!creds) return toast.error("AWS credentials are no longer in this tab. Start a new scan to re-enter them.");
    setCfnBusy("dry");
    try {
      await runDryRunOnce(creds);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isPermsIssue =
        /AccessDenied|not authorized to perform|cloudformation:/i.test(msg);
      if (isPermsIssue) {
        toast.message("Trying to self-grant CloudFormation permissions…");
        try {
          const b = await bootstrapRemediationPermissions({ data: { creds } });
          if (b.ok) {
            toast.success(b.reason);
            // IAM eventual consistency — wait a moment, then retry once.
            await new Promise((r) => setTimeout(r, 4000));
            try {
              await runDryRunOnce(creds);
              return;
            } catch (e2) {
              toast.error(e2 instanceof Error ? e2.message : "Retry failed");
              return;
            }
          }
          toast.error(b.reason);
        } catch (be) {
          toast.error(be instanceof Error ? be.message : "Bootstrap failed");
        }
      } else {
        toast.error(msg);
      }
    } finally {
      setCfnBusy(null);
    }
  }

  async function apply() {
    if (!deployment) return;
    if (!confirm(`Apply this CloudFormation fix to your AWS account?\nStack: ${deployment.stack_name}`)) return;
    const creds = loadCreds();
    if (!creds) return toast.error("AWS credentials are no longer in this tab.");
    setCfnBusy("apply");
    try {
      const r = await executeRemediation({ data: { deploymentId: deployment.id, creds } });
      if (r.ok) toast.success(`Applied · ${r.status}`);
      else toast.error(`Failed · ${r.status}${r.reason ? ` — ${r.reason}` : ""}`);
      const { data } = await supabase
        .from("remediation_deployments")
        .select("*")
        .eq("id", deployment.id)
        .single();
      setDeployment(data as Deployment);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setCfnBusy(null);
    }
  }

  async function rollback() {
    if (!deployment) return;
    if (!confirm(`Roll back by deleting stack ${deployment.stack_name}?`)) return;
    const creds = loadCreds();
    if (!creds) return toast.error("AWS credentials are no longer in this tab.");
    setCfnBusy("rollback");
    try {
      const r = await rollbackRemediation({ data: { deploymentId: deployment.id, creds } });
      if (r.ok) toast.success("Rolled back");
      else toast.error(`Rollback failed · ${r.status}`);
      const { data } = await supabase
        .from("remediation_deployments")
        .select("*")
        .eq("id", deployment.id)
        .single();
      setDeployment(data as Deployment);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed");
    } finally {
      setCfnBusy(null);
    }
  }

  const hasCfn = typeof remediation?.cloudformation === "string" && (remediation.cloudformation as string).trim().length > 0;

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SEV_CLASS[f.severity]}`}>
            {f.severity}
          </Badge>
          <span className="text-sm font-medium text-foreground truncate flex-1">{f.title}</span>
          {deployment?.executed && !deployment.rolled_back && (
            <Badge variant="outline" className="font-mono text-[10px] text-severity-info border-severity-info/40">
              <ShieldCheck className="mr-1 h-3 w-3" /> applied
            </Badge>
          )}
          {deployment?.rolled_back && (
            <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
              rolled back
            </Badge>
          )}
        </div>
        {f.resource && (
          <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{f.resource}</div>
        )}
        {f.description && (
          <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load} disabled={loading}>
            {loading ? (
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            ) : (
              <Wrench className="mr-1 h-3 w-3" />
            )}
            {remediation ? (open ? "Hide playbook" : "Show playbook") : "Generate fix playbook"}
            {remediation && <ChevronDown className={`ml-1 h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />}
          </Button>
        </div>
      </div>

      {open && remediation && (
        <div className="border-t border-border p-3 space-y-3">
          {typeof remediation.explanation === "string" && (
            <p className="text-xs text-foreground leading-relaxed">{remediation.explanation}</p>
          )}
          {typeof remediation.cli === "string" && remediation.cli.trim() && (
            <Block label="AWS CLI" code={remediation.cli} onCopy={() => copy(String(remediation.cli))} />
          )}
          {typeof remediation.cloudformation === "string" && remediation.cloudformation.trim() && (
            <Block
              label="CloudFormation"
              code={remediation.cloudformation}
              onCopy={() => copy(String(remediation.cloudformation))}
            />
          )}
          {typeof remediation.rollback === "string" && remediation.rollback.trim() && (
            <div>
              <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Rollback notes
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{remediation.rollback}</p>
            </div>
          )}

          {hasCfn && (
            <div className="rounded-md border border-border bg-background p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  One-click CloudFormation fix
                </div>
                {deployment && (
                  <Badge variant="outline" className="font-mono text-[10px]">{deployment.status}</Badge>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={dryRun} disabled={cfnBusy !== null}>
                  {cfnBusy === "dry" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldCheck className="mr-1 h-3 w-3" />
                  )}
                  Dry-run change set
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={apply}
                  disabled={cfnBusy !== null || !deployment || deployment.executed || deployment.change_set_status !== "CREATE_COMPLETE"}
                >
                  {cfnBusy === "apply" ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Play className="mr-1 h-3 w-3" />
                  )}
                  Apply CloudFormation fix
                </Button>
                {deployment?.executed && !deployment.rolled_back && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={rollback}
                    disabled={cfnBusy !== null}
                  >
                    {cfnBusy === "rollback" ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Undo2 className="mr-1 h-3 w-3" />
                    )}
                    Rollback
                  </Button>
                )}
              </div>
              {deployment?.error_message && (
                <p className="mt-2 flex items-start gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {deployment.error_message}
                </p>
              )}
              {Array.isArray(deployment?.change_set_changes) && (deployment!.change_set_changes as unknown[]).length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Planned changes
                  </div>
                  {(deployment!.change_set_changes as Array<{
                    action?: string;
                    logicalResourceId?: string;
                    resourceType?: string;
                    replacement?: string;
                  }>).map((c, i) => (
                    <div key={i} className="font-mono text-[11px] flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] uppercase">{c.action ?? "?"}</Badge>
                      <span className="text-muted-foreground">{c.resourceType}</span>
                      <span className="text-foreground">{c.logicalResourceId}</span>
                      {c.replacement && c.replacement !== "False" && (
                        <span className="text-severity-medium">replacement: {c.replacement}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Block({ label, code, onCopy }: { label: string; code: string; onCopy: () => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onCopy}>
          <Copy className="mr-1 h-3 w-3" /> Copy
        </Button>
      </div>
      <pre className="terminal max-h-60 overflow-auto text-[11px] whitespace-pre-wrap">{code}</pre>
    </div>
  );
}
