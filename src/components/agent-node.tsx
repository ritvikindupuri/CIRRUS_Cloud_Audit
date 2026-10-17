import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Key, Network, Radar, Container, Check, Loader2, AlertCircle, Clock } from "lucide-react";
import type { AgentDefinition } from "@/lib/agents/definitions";

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface AgentNodeData extends Record<string, unknown> {
  agent: AgentDefinition;
  status: "pending" | "running" | "complete" | "error";
  findingsCount: number;
  severityCounts?: SeverityCounts;
  selected: boolean;
  onSelect: () => void;
}

const ICONS = {
  radar: Radar,
  key: Key,
  bucket: Container,
  network: Network,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  running: "Executing",
  complete: "Done",
  error: "Failed",
};

export function AgentNode({ data }: NodeProps) {
  const d = (data || {}) as AgentNodeData;
  const agent = d.agent || {
    type: "recon",
    name: "Agent",
    tagline: "",
    colorVar: "var(--color-agent-recon)",
    icon: "radar",
  };
  const Icon = ICONS[agent.icon] ?? Radar;
  const StatusIcon =
    d.status === "complete"
      ? Check
      : d.status === "running"
        ? Loader2
        : d.status === "error"
          ? AlertCircle
          : Clock;

  const sev = d.severityCounts ?? {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  const totalFindings = d.findingsCount;

  return (
    <div
      onClick={d.onSelect}
      className={`group cursor-pointer rounded-lg border bg-card transition-all ${
        d.selected
          ? "border-primary shadow-[0_0_0_3px_oklch(0.78_0.17_55/0.2)]"
          : "border-border hover:border-primary/40"
      } ${d.status === "running" ? "pulse-running" : ""}`}
      style={{ width: 240 }}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />

      <div className="flex items-start gap-3 p-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md"
          style={{ backgroundColor: agent.colorVar, color: "oklch(0.15 0.012 260)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-sm font-semibold text-foreground">{agent.name}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{agent.tagline}</div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px]">
        <span
          className={`inline-flex items-center gap-1.5 font-mono uppercase tracking-wider ${
            d.status === "complete"
              ? "text-emerald-400"
              : d.status === "running"
                ? "text-primary"
                : d.status === "error"
                  ? "text-destructive"
                  : "text-muted-foreground"
          }`}
        >
          <StatusIcon className={`h-3 w-3 ${d.status === "running" ? "animate-spin" : ""}`} />
          {STATUS_LABEL[d.status]}
        </span>
        <span className="font-mono text-muted-foreground">
          {totalFindings} finding{totalFindings === 1 ? "" : "s"}
        </span>
      </div>

      {/* Segmented Color Criticality Bar (Critical -> High -> Medium -> Low -> Info) */}
      <div className="px-3 pb-2.5 pt-0.5">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2 flex">
          {totalFindings > 0 ? (
            <>
              {sev.critical > 0 && (
                <div
                  title={`Critical: ${sev.critical}`}
                  style={{ width: `${(sev.critical / totalFindings) * 100}%` }}
                  className="h-full bg-severity-critical transition-all"
                />
              )}
              {sev.high > 0 && (
                <div
                  title={`High: ${sev.high}`}
                  style={{ width: `${(sev.high / totalFindings) * 100}%` }}
                  className="h-full bg-severity-high transition-all"
                />
              )}
              {sev.medium > 0 && (
                <div
                  title={`Medium: ${sev.medium}`}
                  style={{ width: `${(sev.medium / totalFindings) * 100}%` }}
                  className="h-full bg-severity-medium transition-all"
                />
              )}
              {sev.low > 0 && (
                <div
                  title={`Low: ${sev.low}`}
                  style={{ width: `${(sev.low / totalFindings) * 100}%` }}
                  className="h-full bg-severity-low transition-all"
                />
              )}
              {sev.info > 0 && (
                <div
                  title={`Informational: ${sev.info}`}
                  style={{ width: `${(sev.info / totalFindings) * 100}%` }}
                  className="h-full bg-severity-info opacity-80 transition-all"
                />
              )}
            </>
          ) : (
            <div title="No findings detected" className="h-full w-full bg-emerald-500/20" />
          )}
        </div>
      </div>
    </div>
  );
}
