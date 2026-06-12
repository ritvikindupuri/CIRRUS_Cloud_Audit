import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { getAgentDefinition, type AgentType } from "@/lib/agents/definitions";
import { Search, Terminal, AlertOctagon, Brain, CheckCircle2, ShieldAlert } from "lucide-react";

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

const KIND_OPTIONS = [
  { id: "reasoning", label: "Reasoning", icon: Brain },
  { id: "stdin", label: "Commands", icon: Terminal },
  { id: "stdout", label: "Outputs", icon: Terminal },
  { id: "final", label: "Final", icon: CheckCircle2 },
  { id: "violation", label: "Violations", icon: ShieldAlert },
] as const;

export function ExecutionTimeline({
  scanId,
  runs,
}: {
  scanId: string;
  runs: RunMeta[];
}) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [query, setQuery] = useState("");
  const [isRegex, setIsRegex] = useState(false);
  const [regexError, setRegexError] = useState(false);
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());

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

  const isSafetyViolation = (s: Step) => {
    return s.kind === "thought" && !!s.thought && s.thought.startsWith("[SAFETY VIOLATION DETECTED]");
  };

  // Validate regular expression whenever query or isRegex changes
  useEffect(() => {
    if (isRegex && query.trim()) {
      try {
        new RegExp(query.trim(), "i");
        setRegexError(false);
      } catch (e) {
        setRegexError(true);
      }
    } else {
      setRegexError(false);
    }
  }, [query, isRegex]);

  const filtered = useMemo(() => {
    let list = sorted;

    // 1. Filter by Kinds (if any selected)
    if (selectedKinds.size > 0) {
      list = list.filter((s) => {
        const violation = isSafetyViolation(s);
        if (selectedKinds.has("violation") && violation) return true;
        if (selectedKinds.has("reasoning") && s.kind === "thought" && !violation) return true;
        if (selectedKinds.has("stdin") && s.kind === "tool_call") return true;
        if (selectedKinds.has("stdout") && s.kind === "tool_result") return true;
        if (selectedKinds.has("final") && s.kind === "final") return true;
        return false;
      });
    }

    // 2. Filter by Agents (if any selected)
    if (selectedAgents.size > 0) {
      list = list.filter((s) => selectedAgents.has(s.agent_run_id));
    }

    // 3. Filter by Search Query
    if (query.trim()) {
      if (isRegex) {
        if (regexError) {
          return [];
        }
        try {
          const r = new RegExp(query.trim(), "i");
          list = list.filter((s) => {
            const run = runById[s.agent_run_id];
            const agentName = run
              ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined).name
              : "";
            const textToMatch = [
              s.thought ?? "",
              s.tool_name ?? "",
              s.error ?? "",
              s.tool_input ? JSON.stringify(s.tool_input) : "",
              s.tool_output ? JSON.stringify(s.tool_output) : "",
            ].join(" ");

            return r.test(textToMatch) || r.test(agentName);
          });
        } catch (e) {
          return [];
        }
      } else {
        const q = query.trim().toLowerCase();
        list = list.filter((s) => {
          const run = runById[s.agent_run_id];
          const agentName = run
            ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined).name
            : "";
          const textToMatch = [
            s.thought ?? "",
            s.tool_name ?? "",
            s.error ?? "",
            s.tool_input ? JSON.stringify(s.tool_input) : "",
            s.tool_output ? JSON.stringify(s.tool_output) : "",
          ].join(" ").toLowerCase();

          return textToMatch.includes(q) || agentName.toLowerCase().includes(q);
        });
      }
    }

    return list;
  }, [sorted, selectedKinds, selectedAgents, query, isRegex, regexError, runById]);

  function toggleKind(kindId: string) {
    setSelectedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kindId)) {
        next.delete(kindId);
      } else {
        next.add(kindId);
      }
      return next;
    });
  }

  function toggleAgent(agentId: string) {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  }

  function copyTranscript() {
    const lines = filtered.map((s) => {
      const run = runById[s.agent_run_id];
      const name = run
        ? getAgentDefinition(run.agent_type, run.custom_agent ?? undefined).name
        : "agent";
      const t = new Date(s.created_at).toISOString();
      if (s.kind === "thought") {
        if (s.thought?.startsWith("[SAFETY VIOLATION DETECTED]")) {
          return `[${t}] ${name} · SAFETY VIOLATION DETECTED\n${s.thought}\n`;
        }
        return `[${t}] ${name} · thought\n${s.thought ?? ""}\n`;
      }
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
            placeholder={isRegex ? "Search with regex..." : "Search command, output, reasoning…"}
            className={`h-8 pl-7 pr-12 text-xs ${
              regexError ? "border-destructive/80 focus-visible:ring-destructive/30" : ""
            }`}
          />
          <button
            onClick={() => setIsRegex(!isRegex)}
            className={`absolute right-1 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[10px] font-mono font-bold border transition-colors ${
              isRegex
                ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90"
                : "bg-transparent text-muted-foreground border-border hover:bg-surface"
            }`}
            title="Toggle Regular Expression Search"
          >
            .*
          </button>
        </div>
        <button
          onClick={copyTranscript}
          className="rounded-md border border-border px-2 py-1 text-[11px] font-mono hover:bg-surface"
        >
          Copy transcript
        </button>
      </div>

      {/* Filter Chips Container */}
      <div className="flex flex-col gap-2 border-b border-border px-3 py-2 bg-surface/30">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono text-muted-foreground mr-1">Types:</span>
          {KIND_OPTIONS.map((opt) => {
            const active = selectedKinds.has(opt.id);
            const Icon = opt.icon;
            return (
              <Badge
                key={opt.id}
                variant="outline"
                className={`cursor-pointer select-none gap-1 py-0.5 px-2 font-mono text-[9px] transition-all hover:bg-surface/80 ${
                  active
                    ? "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30"
                    : "text-muted-foreground border-border bg-transparent"
                }`}
                onClick={() => toggleKind(opt.id)}
              >
                <Icon className="h-2.5 w-2.5" />
                {opt.label}
              </Badge>
            );
          })}
        </div>

        {runs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-1.5">
            <span className="text-[10px] font-mono text-muted-foreground mr-1">Agents:</span>
            {runs.map((r) => {
              const def = getAgentDefinition(r.agent_type, r.custom_agent ?? undefined);
              const active = selectedAgents.has(r.id);
              return (
                <Badge
                  key={r.id}
                  variant="outline"
                  className={`cursor-pointer select-none gap-1 py-0.5 px-2 font-mono text-[9px] transition-all hover:bg-surface/80 ${
                    active
                      ? "bg-primary/20 text-primary border-primary/50 hover:bg-primary/30"
                      : "text-muted-foreground border-border bg-transparent"
                  }`}
                  onClick={() => toggleAgent(r.id)}
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: def.colorVar }}
                  />
                  {def.name}
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span>{filtered.length} of {sorted.length} entries</span>
        {regexError && <span className="text-destructive font-semibold lowercase">Invalid regex expression</span>}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-2">
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
            const violation = isSafetyViolation(s);

            if (violation) {
              return (
                <div key={s.id} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-destructive">
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
                    <Badge variant="outline" className="gap-1 font-mono text-[9px] border-destructive bg-destructive/10 text-destructive">
                      <ShieldAlert className="h-2.5 w-2.5 animate-pulse" />
                      safety violation
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-start gap-2 rounded border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                    <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    <div className="flex-1">
                      <span className="font-bold">MUTATION BLOCKED:</span>{" "}
                      {hl(s.thought ?? "", query, isRegex)}
                    </div>
                  </div>
                </div>
              );
            }

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
                <StepBody s={s} highlight={query} isRegex={isRegex} />
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

function StepBody({ s, highlight, isRegex }: { s: Step; highlight: string; isRegex: boolean }) {
  if (s.kind === "thought") {
    return (
      <p className="mt-1 text-xs leading-relaxed text-foreground">
        {hl(s.thought ?? "", highlight, isRegex)}
      </p>
    );
  }
  if (s.kind === "final") {
    if (s.error) {
      return (
        <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
          <AlertOctagon className="mt-0.5 h-3 w-3 shrink-0" /> {hl(s.error, highlight, isRegex)}
        </p>
      );
    }
    return (
      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">
        {hl(s.thought ?? "", highlight, isRegex)}
      </p>
    );
  }
  if (s.kind === "tool_call") {
    const cmd = (s.tool_input as { command?: string })?.command ?? s.tool_name ?? "";
    return (
      <pre className="terminal mt-1 text-[11px]">
        <span className="prompt">$ </span>
        {hl(cmd, highlight, isRegex)}
      </pre>
    );
  }
  const out = (s.tool_output as { result?: unknown })?.result ?? s.tool_output;
  const text = typeof out === "string" ? out : JSON.stringify(out, null, 2);
  return (
    <pre className="terminal mt-1 max-h-48 overflow-auto text-[11px] whitespace-pre-wrap">
      {hl(text, highlight, isRegex)}
    </pre>
  );
}

function hl(text: string, q: string, isRegex = false): React.ReactNode {
  if (!q) return text;
  if (isRegex) {
    try {
      const regex = new RegExp(q, "gi");
      const matches: { start: number; end: number }[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
        matches.push({ start: match.index, end: match.index + match[0].length });
        if (matches.length > 500) break;
      }
      if (matches.length === 0) return text;

      const result: React.ReactNode[] = [];
      let lastIdx = 0;
      matches.forEach((m, idx) => {
        if (m.start > lastIdx) {
          result.push(text.slice(lastIdx, m.start));
        }
        result.push(
          <mark key={idx} className="bg-primary/30 text-foreground rounded-sm px-0.5">
            {text.slice(m.start, m.end)}
          </mark>
        );
        lastIdx = m.end;
      });
      if (lastIdx < text.length) {
        result.push(text.slice(lastIdx));
      }
      return <>{result}</>;
    } catch (e) {
      return text;
    }
  } else {
    try {
      const escaped = q.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      const matches: { start: number; end: number }[] = [];
      let match;
      while ((match = regex.exec(text)) !== null) {
        matches.push({ start: match.index, end: match.index + match[0].length });
        if (matches.length > 500) break;
      }
      if (matches.length === 0) return text;

      const result: React.ReactNode[] = [];
      let lastIdx = 0;
      matches.forEach((m, idx) => {
        if (m.start > lastIdx) {
          result.push(text.slice(lastIdx, m.start));
        }
        result.push(
          <mark key={idx} className="bg-primary/30 text-foreground rounded-sm px-0.5">
            {text.slice(m.start, m.end)}
          </mark>
        );
        lastIdx = m.end;
      });
      if (lastIdx < text.length) {
        result.push(text.slice(lastIdx));
      }
      return <>{result}</>;
    } catch (e) {
      return text;
    }
  }
}
