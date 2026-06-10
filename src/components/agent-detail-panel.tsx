import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAgentDefinition, type AgentType } from "@/lib/agents/definitions";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Terminal } from "lucide-react";

interface Step {
  id: string;
  step_index: number;
  kind: "thought" | "tool_call" | "tool_result" | "final";
  thought: string | null;
  tool_name: string | null;
  tool_input: Record<string, unknown> | null;
  tool_output: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
}

interface Run {
  id: string;
  agent_type: AgentType;
  status: string;
  summary: string | null;
}

export function AgentDetailPanel({ run }: { run: Run | null }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!run) return;
    setSteps([]);
    supabase
      .from("agent_steps")
      .select("*")
      .eq("agent_run_id", run.id)
      .order("step_index", { ascending: true })
      .then(({ data }) => setSteps((data ?? []) as Step[]));

    const channel = supabase
      .channel(`steps:${run.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_steps",
          filter: `agent_run_id=eq.${run.id}`,
        },
        (payload) => setSteps((prev) => [...prev, payload.new as Step]),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [run]);

  const merged = useMemo(() => {
    // Pair tool_call with tool_result by tool_name + nearest later result.
    const out: {
      kind: string;
      thought?: string;
      tool_name?: string;
      command?: string;
      result?: unknown;
      error?: string;
      id: string;
    }[] = [];
    const sorted = [...steps].sort((a, b) => a.step_index - b.step_index);
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      if (s.kind === "thought") {
        out.push({ kind: "thought", thought: s.thought ?? "", id: s.id });
      } else if (s.kind === "tool_call") {
        const next = sorted[i + 1];
        if (next && next.kind === "tool_result" && next.tool_name === s.tool_name) {
          const cmd = (s.tool_input as { command?: string })?.command ?? s.tool_name ?? "";
          const result = (next.tool_output as { result?: unknown })?.result ?? next.tool_output;
          out.push({ kind: "tool", tool_name: s.tool_name ?? "", command: cmd, result, id: s.id });
          i++; // skip result
        } else {
          const cmd = (s.tool_input as { command?: string })?.command ?? s.tool_name ?? "";
          out.push({ kind: "tool", tool_name: s.tool_name ?? "", command: cmd, id: s.id });
        }
      } else if (s.kind === "final") {
        out.push({
          kind: "final",
          thought: s.thought ?? "",
          error: s.error ?? undefined,
          id: s.id,
        });
      }
    }
    return out;
  }, [steps]);

  if (!run) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select an agent node to see its thinking and AWS calls.
      </div>
    );
  }

  const def = AGENT_DEFINITIONS[run.agent_type];

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: def.colorVar }}
          />
          <span className="text-sm font-semibold">{def.name}</span>
          <Badge variant="outline" className="ml-auto font-mono text-[10px] uppercase">
            {run.status}
          </Badge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{def.tagline}</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {merged.length === 0 && (
            <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Agent has not produced any output yet…
            </div>
          )}

          {merged.map((m, idx) => {
            if (m.kind === "thought") {
              return (
                <div key={m.id} className="rounded-md border border-border bg-surface p-3">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    <span className="text-primary">›</span> Thought #{idx + 1}
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{m.thought}</p>
                </div>
              );
            }
            if (m.kind === "final") {
              return (
                <div key={m.id} className="rounded-md border border-primary/40 bg-primary/5 p-3">
                  <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-primary">
                    Final summary
                  </div>
                  {m.error ? (
                    <p className="text-sm text-destructive">{m.error}</p>
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                      {m.thought}
                    </p>
                  )}
                </div>
              );
            }
            // tool
            const isOpen = expanded[m.id] ?? true;
            return (
              <div key={m.id} className="rounded-md border border-border bg-surface">
                <button
                  onClick={() => setExpanded((p) => ({ ...p, [m.id]: !isOpen }))}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  <ChevronRight
                    className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                  <Terminal className="h-3.5 w-3.5 text-primary" />
                  <span className="font-mono text-[12px] text-foreground truncate">
                    {m.tool_name}
                  </span>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-border px-3 py-2">
                    <div>
                      <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                        Command
                      </div>
                      <pre className="terminal text-[12px]">
                        <span className="prompt">$ </span>
                        {m.command}
                      </pre>
                    </div>
                    {m.result !== undefined && (
                      <div>
                        <div className="mb-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Output
                        </div>
                        <pre className="terminal max-h-72 overflow-auto text-[11.5px]">
                          {typeof m.result === "string"
                            ? m.result
                            : JSON.stringify(m.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
