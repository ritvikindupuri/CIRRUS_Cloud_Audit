import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, Copy, ChevronDown, Loader2 } from "lucide-react";
import { generateRemediation } from "@/lib/scans.functions";
import { toast } from "sonner";

interface Finding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
  remediation?: Record<string, unknown> | null;
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

  return (
    <div className="rounded-md border border-border bg-surface">
      <div className="p-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SEV_CLASS[f.severity]}`}>
            {f.severity}
          </Badge>
          <span className="text-sm font-medium text-foreground truncate flex-1">{f.title}</span>
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
                Rollback
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{remediation.rollback}</p>
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
