import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Key, Network, Radar, Container, Check, Loader2, AlertCircle, Clock } from "lucide-react";
import type { AgentDefinition } from "@/lib/agents/definitions";

export interface AgentNodeData extends Record<string, unknown> {
  agent: AgentDefinition;
  status: "pending" | "running" | "complete" | "error";
  findingsCount: number;
  selected: boolean;
  onSelect: () => void;
}

const ICONS = {
  radar: Radar,
  key: Key,
  bucket: Container,
  network: Network,
};

const STATUS_LABEL = {
  pending: "Waiting",
  running: "Executing",
  complete: "Done",
  error: "Failed",
};

export function AgentNode({ data }: NodeProps) {
  const d = data as AgentNodeData;
  const Icon = ICONS[d.agent.icon];
  const StatusIcon =
    d.status === "complete"
      ? Check
      : d.status === "running"
        ? Loader2
        : d.status === "error"
          ? AlertCircle
          : Clock;

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
          style={{ backgroundColor: d.agent.colorVar, color: "oklch(0.15 0.012 260)" }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-sm font-semibold text-foreground">{d.agent.name}</span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{d.agent.tagline}</div>
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
          {d.findingsCount} finding{d.findingsCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
