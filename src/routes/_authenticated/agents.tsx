import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { CirrusLogo } from "@/components/cirrus-logo";
import { AWS_SERVICE_OPTIONS, type AwsService } from "@/lib/agents/definitions";
import { validateCustomAgentDsl } from "@/lib/agents/dsl-validator";
import { ArrowLeft, Plus, Trash2, Beaker, AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  services: string[];
  color: string;
  created_at: string;
}

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Custom agents · Cirrus" }] }),
  component: AgentsPage,
});

const COLORS = ["#a78bfa", "#60a5fa", "#34d399", "#fbbf24", "#f87171", "#fb7185", "#22d3ee"];
const STARTER_PROMPT = `You are an AWS security auditor.

Your goal: <describe what to check, e.g. "find Lambda functions with overly-permissive IAM roles">.

Steps:
1. Enumerate the relevant resources using the available AWS tools.
2. For each resource, inspect its configuration.
3. Call report_finding for anything risky, with severity (info/low/medium/high/critical), a clear title, and the resource ARN.

End with a 1-paragraph summary and STOP.`;

function AgentsPage() {
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [editing, setEditing] = useState<Partial<CustomAgent> | null>(null);

  async function load() {
    const { data } = await supabase
      .from("custom_agents")
      .select("*")
      .order("created_at", { ascending: false });
    setAgents((data ?? []) as CustomAgent[]);
  }
  useEffect(() => {
    void load();
  }, []);

  const validation = useMemo(() => {
    if (!editing) return null;
    return validateCustomAgentDsl({
      name: editing.name ?? "",
      description: editing.description ?? null,
      system_prompt: editing.system_prompt ?? "",
      services: editing.services ?? [],
      color: editing.color ?? COLORS[0],
    });
  }, [editing]);

  async function save() {
    if (!editing) return;
    if (!validation?.ok) {
      toast.error(validation?.errors[0] ?? "Validation failed");
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const payload = {
      name: editing.name!.trim(),
      description: editing.description?.trim() ?? null,
      system_prompt: editing.system_prompt!,
      services: editing.services ?? [],
      color: editing.color ?? COLORS[0],
    };

    if (editing.id) {
      const { error } = await supabase.from("custom_agents").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("custom_agents")
        .insert({ ...payload, user_id: userData.user.id });
      if (error) return toast.error(error.message);
    }
    toast.success("Saved");
    setEditing(null);
    void load();
  }

  async function remove(id: string) {
    if (!confirm("Delete this custom agent?")) return;
    const { error } = await supabase.from("custom_agents").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <CirrusLogo />
            </Link>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              › custom agents
            </span>
          </div>
          <Link to="/dashboard">
            <Button size="sm" variant="ghost">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Custom agents</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Write your own checks. Pick which AWS service APIs the agent can call. Cirrus runs them
              alongside the built-in agents in any scan.
            </p>
          </div>
          <Button
            onClick={() =>
              setEditing({
                name: "",
                description: "",
                system_prompt: STARTER_PROMPT,
                services: ["iam"],
                color: COLORS[0],
              })
            }
          >
            <Plus className="mr-1.5 h-4 w-4" /> New agent
          </Button>
        </div>

        {editing && (
          <section className="mb-8 rounded-lg border border-primary/40 bg-card p-5">
            <h3 className="text-sm font-semibold mb-4">{editing.id ? "Edit agent" : "New custom agent"}</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Name</Label>
                  <Input
                    value={editing.name ?? ""}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Lambda permission hunter"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Color</Label>
                  <div className="mt-1 flex gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setEditing({ ...editing, color: c })}
                        className={`h-7 w-7 rounded-md border-2 ${editing.color === c ? "border-foreground" : "border-transparent"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Description</Label>
                <Input
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Finds Lambda functions with iam:* in their role"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Allowed AWS services
                </Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {AWS_SERVICE_OPTIONS.map((svc) => {
                    const active = (editing.services ?? []).includes(svc);
                    return (
                      <label
                        key={svc}
                        className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
                          active ? "border-primary/60 bg-primary/5" : "border-border"
                        }`}
                      >
                        <Checkbox
                          checked={active}
                          onCheckedChange={() => {
                            const cur = new Set(editing.services ?? []);
                            if (cur.has(svc)) cur.delete(svc);
                            else cur.add(svc);
                            setEditing({ ...editing, services: Array.from(cur) as AwsService[] });
                          }}
                        />
                        <span className="font-mono">{svc}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  System prompt (the agent's instructions)
                </Label>
                <Textarea
                  value={editing.system_prompt ?? ""}
                  onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })}
                  rows={12}
                  className="mt-1 font-mono text-xs"
                />
              </div>
              {validation && (
                <div className="rounded-md border border-border bg-background p-3 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {validation.ok ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-severity-info" />
                    ) : (
                      <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
                    )}
                    DSL safety check
                  </div>
                  {validation.errors.map((e, i) => (
                    <p key={i} className="flex items-start gap-1 text-xs text-destructive">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {e}
                    </p>
                  ))}
                  {validation.warnings.map((w, i) => (
                    <p key={i} className="flex items-start gap-1 text-xs text-severity-medium">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                    </p>
                  ))}
                  {validation.forbiddenCommands.length > 0 && (
                    <div className="text-[11px] font-mono text-muted-foreground">
                      Blocked phrases:{" "}
                      {validation.forbiddenCommands.slice(0, 4).map((c, i) => (
                        <span key={i} className="mr-2 rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">
                          {c.phrase}
                        </span>
                      ))}
                    </div>
                  )}
                  {validation.ok && validation.warnings.length === 0 && (
                    <p className="text-xs text-muted-foreground">All checks passed.</p>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={save} disabled={!validation?.ok}>Save agent</Button>
                <Button variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          </section>
        )}

        {agents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-16 text-center">
            <Beaker className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No custom agents yet. Build one to extend Cirrus with your own checks.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {agents.map((a) => (
              <div key={a.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                      <span className="font-medium truncate">{a.name}</span>
                    </div>
                    {a.description && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {a.services.map((s) => (
                        <span key={s} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface border border-border">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(a.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
