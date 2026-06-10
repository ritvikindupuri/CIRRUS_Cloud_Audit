import { Badge } from "@/components/ui/badge";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface Finding {
  id: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  resource: string | null;
}

const SEV_CLASS: Record<Finding["severity"], string> = {
  info: "border-severity-info/40 text-severity-info",
  low: "border-severity-low/40 text-severity-low",
  medium: "border-severity-medium/40 text-severity-medium",
  high: "border-severity-high/40 text-severity-high",
  critical: "border-severity-critical/40 text-severity-critical",
};

function keyOf(f: Finding) {
  return `${f.severity}::${f.title}::${f.resource ?? ""}`;
}

export function DriftDiff({ current, previous }: { current: Finding[]; previous: Finding[] }) {
  const prevSet = new Set(previous.map(keyOf));
  const curSet = new Set(current.map(keyOf));

  const newFindings = current.filter((f) => !prevSet.has(keyOf(f)));
  const resolved = previous.filter((f) => !curSet.has(keyOf(f)));
  const unchanged = current.filter((f) => prevSet.has(keyOf(f)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="New" count={newFindings.length} icon={ArrowUp} tone="text-severity-high" />
        <Stat label="Resolved" count={resolved.length} icon={ArrowDown} tone="text-emerald-400" />
        <Stat label="Unchanged" count={unchanged.length} icon={Minus} tone="text-muted-foreground" />
      </div>

      <Section title="New findings" tone="text-severity-high" items={newFindings} />
      <Section title="Resolved" tone="text-emerald-400" items={resolved} resolved />
      <Section title="Still present" tone="text-muted-foreground" items={unchanged} />
    </div>
  );
}

function Stat({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface p-3 text-center">
      <Icon className={`mx-auto h-4 w-4 ${tone}`} />
      <div className={`mt-1 text-lg font-semibold ${tone}`}>{count}</div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function Section({
  title,
  tone,
  items,
  resolved,
}: {
  title: string;
  tone: string;
  items: Finding[];
  resolved?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className={`mb-2 text-[10px] font-mono uppercase tracking-wider ${tone}`}>
        {title} · {items.length}
      </div>
      <div className="space-y-1.5">
        {items.map((f) => (
          <div
            key={f.id}
            className={`rounded-md border border-border bg-surface p-2.5 ${resolved ? "opacity-70 line-through" : ""}`}
          >
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`font-mono text-[10px] uppercase ${SEV_CLASS[f.severity]}`}>
                {f.severity}
              </Badge>
              <span className="text-sm truncate">{f.title}</span>
            </div>
            {f.resource && (
              <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{f.resource}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
