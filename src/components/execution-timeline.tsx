import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getAgentDefinition, type AgentType } from "@/lib/agents/definitions";
import { Search, Terminal, AlertOctagon, Brain, CheckCircle2 } from "lucide-react";

interface Step {
  id: string;
  agent_run_id: string;
  step_index: number;
  kind: "thought" | "tool_call" | "tool_result" | "final";
  thought: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

interface RunMeta {
  id: string;
  agent_type: AgentType;
  custom_agent_id: string | null;
  custom_agent?: { name: string; color: string; description: string | null } | null;
}

export function ExecutionTimeline({
  scanId,
  runs,
}: {
  scanId: string;
  runs: RunMeta[];
}) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    const runIds = runs.map((r) => r.id);
    if (runIds.length === 0) {
      setSteps([]);
      return;
    }
    supabase
      .from("agent_steps")
      .select("*")
      .in("agent_run_id", runIds)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (active) setSteps((data ?? []) as Step[]);
      });

    const channel = supabase
      .channel(`timeline:${scanId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_steps" },
        (payload) => {
          const s = payload.new as Step;
          if (runIds.includes(s.agent_run_id)) {
            setSteps((prev) => [...prev, s]);
          }
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [scanId, runs]);

  const runById = useMemo(() => {
    const m: Record<string, RunMeta> = {};
    for (const r of runs) m[r.id] = r;
    return m;
  }, [runs]);

  const sorted = useMemo(
    () =>
      [...steps].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      ),
    [steps],
  );

  const q = query.trim().toLowerCase();
  const filtered = !q
    ? sorted
    : sorted.filter((s) => {
        const blob = [
          s.thought ?? "",
          s.tool_name ?? "",
          s.error ?? "",
          s.tool_input ? JSON.stringify(s.tool_input) : "",
          s.tool_output ? JSON.stringify(s.tool_output) : "",
        ]
          .join(" ")
          .toLowerCase();
        const run = runById[s.agent_run_id];
        const agentName = run
          ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined).name
          : "";
        return blob.includes(q) || agentName.toLowerCase().includes(q);
      });

  function copyTranscript() {
    const lines = filtered.map((s) => {
      const run = runById[s.agent_run_id];
      const name = run
        ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined).name
        : "agent";
      const t = new Date(s.created_at).toISOString();
      if (s.kind === "thought")
        return `[${t}] ${name} · thought\n${s.thought ?? ""}\n`;
      if (s.kind === "final")
        return `[${t}] ${name} · final\n${s.error ? "ERROR: " + s.error : s.thought ?? ""}\n`;
      if (s.kind === "tool_call") {
        const cmd = (s.tool_input as { command?: string })?.command ?? s.tool_name;
        return `[${t}] ${name} · $ ${cmd}`;
      }
      const result = (s.tool_output as { result?: unknown })?.result ?? s.tool_output;
      return `[${t}] ${name} · stdout\n${typeof result === "string" ? result : JSON.stringify(result, null, 2)}\n`;
    });
    void navigator.clipboard.writeText(lines.join("\n"));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search command, output, reasoning…"
            className="h-8 pl-7 text-xs"
          />
        </div>
        <button
          onClick={copyTranscript}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-mono hover:bg-surface"
        >
          Copy transcript
        </button>
      </div>

      <div className="border-b border-border px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {filtered.length} of {sorted.length} entries
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {filtered.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              {sorted.length === 0
                ? "Timeline is empty. Steps appear here as agents run."
                : "No entries match that search."}
            </div>
          )}
          {filtered.map((s) => {
            const run = runById[s.agent_run_id];
            const def = run
              ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined)
              : null;
            const time = new Date(s.created_at).toLocaleTimeString([], {
              hour12: false,
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            return (
              <div key={s.id} className="rounded-md border border-border bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  <span>{time}</span>
                  {def && (
                    <span className="flex items-center gap-1">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: def.colorVar }}
                      />
                      {def.name}
                    </span>
                  )}
                  <KindBadge kind={s.kind} />
                </div>
                <StepBody s={s} highlight={q} />
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

function KindBadge({ kind }: { kind: Step["kind"] }) {
  const map = {
    thought: { icon: Brain, label: "reasoning", cls: "text-primary" },
    tool_call: { icon: Terminal, label: "stdin", cls: "text-foreground" },
    tool_result: { icon: Terminal, label: "stdout", cls: "text-muted-foreground" },
    final: { icon: CheckCircle2, label: "final", cls: "text-severity-info" },
  } as const;
  const m = map[kind];
  const Icon = m.icon;
  return (
    <Badge variant="outline" className={`gap-1 font-mono text-[9px] ${m.cls}`}>
      <Icon className="h-2.5 w-2.5" />
      {m.label}
    </Badge>
  );
}

function StepBody({ s, highlight }: { s: Step; highlight: string }) {
  if (s.kind === "thought") {
    return (
      <p className="mt-1 text-xs leading-relaxed text-foreground">
        {hl(s.thought ?? "", highlight)}
      </p>
    );
  }
  if (s.kind === "final") {
    if (s.error) {
      return (
        <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
          <AlertOctagon className="mt-0.5 h-3 w-3 shrink-0" /> {hl(s.error, highlight)}
        </p>
      );
    }
    return (
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {hl(s.thought ?? "", highlight)}
      </p>
    );
  }
  if (s.kind === "tool_call") {
    const cmd = (s.tool_input as { command?: string })?.command ?? s.tool_name ?? "";
    return (
      <pre className="terminal mt-1 text-[11px]">
        <span className="prompt">$ </span>
        {hl(cmd, highlight)}
      </pre>
    );
  }
  const out = (s.tool_output as { result?: unknown })?.result ?? s.tool_output;
  const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
  return (
    <pre className="terminal mt-1 max-h-48 overflow-auto text-[11px] whitespace-pre-wrap">
      {hl(text, highlight)}
    </pre>
  );
}

function hl(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}
