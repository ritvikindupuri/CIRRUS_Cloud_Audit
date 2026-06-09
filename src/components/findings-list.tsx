import { Badge } from "@/components/ui/badge";

interface Finding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
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
        <div key={f.id} className="rounded-md border border-border bg-surface p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SEV_CLASS[f.severity]}`}>
                  {f.severity}
                </Badge>
                <span className="text-sm font-medium text-foreground truncate">{f.title}</span>
              </div>
              {f.resource && (
                <div className="mt-1 truncate font-mono text-[11px] text-muted-foreground">{f.resource}</div>
              )}
              {f.description && (
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{f.description}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
