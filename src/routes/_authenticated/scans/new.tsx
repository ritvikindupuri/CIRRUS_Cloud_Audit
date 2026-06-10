import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CirrusLogo } from "@/components/cirrus-logo";
import { AwsSetupGuide } from "@/components/aws-setup-guide";
import {
  AGENT_DEFINITIONS,
  AGENT_ORDER,
  AWS_REGIONS,
  type BuiltinAgentType,
} from "@/lib/agents/definitions";
import { saveCreds } from "@/lib/aws-creds";
import { runScan } from "@/lib/scans.functions";
import { ArrowLeft, Play, ShieldAlert, Beaker, Calendar } from "lucide-react";
import { toast } from "sonner";

interface CustomAgent {
  id: string;
  name: string;
  description: string | null;
  color: string;
  services: string[];
}

export const Route = createFileRoute("/_authenticated/scans/new")({
  head: () => ({ meta: [{ title: "New scan · Cirrus" }] }),
  component: NewScan,
});

function NewScan() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [region, setRegion] = useState("us-east-1");
  const [selected, setSelected] = useState<Record<BuiltinAgentType, boolean>>({
    recon: true,
    iam: true,
    s3: true,
    ec2: true,
  });
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<Record<string, boolean>>({});
  const [saveAsSchedule, setSaveAsSchedule] = useState(false);
  const [cadenceDays, setCadenceDays] = useState(7);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    void supabase
      .from("custom_agents")
      .select("id, name, description, color, services")
      .order("created_at", { ascending: false })
      .then(({ data }) => setCustomAgents((data ?? []) as CustomAgent[]));
  }, []);

  function toggle(t: BuiltinAgentType) {
    setSelected((p) => ({ ...p, [t]: !p[t] }));
  }
  function toggleCustom(id: string) {
    setSelectedCustom((p) => ({ ...p, [id]: !p[id] }));
  }

  async function launch() {
    const agents = AGENT_ORDER.filter((t) => selected[t]);
    const customIds = customAgents.filter((c) => selectedCustom[c.id]).map((c) => c.id);
    if (agents.length === 0 && customIds.length === 0)
      return toast.error("Pick at least one agent.");
    if (!accessKeyId || !secretAccessKey)
      return toast.error("AWS access key and secret are required.");
    if (!name.trim()) return toast.error("Give this scan a name.");

    setLaunching(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      let scheduledScanId: string | null = null;
      if (saveAsSchedule) {
        const { data: sched, error: sErr } = await supabase
          .from("scheduled_scans")
          .insert({
            user_id: userData.user.id,
            name: name.trim(),
            region,
            selected_agents: agents,
            custom_agent_ids: customIds,
            cadence_days: cadenceDays,
            next_run_at: new Date(Date.now() + cadenceDays * 86400_000).toISOString(),
          })
          .select("id")
          .single();
        if (sErr) throw sErr;
        scheduledScanId = sched.id;
      }

      const { data: scan, error: scanErr } = await supabase
        .from("scans")
        .insert({
          user_id: userData.user.id,
          name: name.trim(),
          region,
          status: "pending",
          selected_agents: agents,
          custom_agent_ids: customIds,
          scheduled_scan_id: scheduledScanId,
        })
        .select("id")
        .single();
      if (scanErr || !scan) throw scanErr ?? new Error("Failed to create scan");

      const positions = [
        { x: 0, y: 0 }, { x: 320, y: -120 }, { x: 320, y: 120 }, { x: 640, y: 0 },
        { x: 640, y: -200 }, { x: 640, y: 200 }, { x: 960, y: 0 }, { x: 960, y: -120 },
      ];
      const builtinRuns = agents.map((agent_type, i) => ({
        scan_id: scan.id,
        agent_type,
        status: "pending",
        position_x: positions[i % positions.length].x,
        position_y: positions[i % positions.length].y,
        custom_agent_id: null as string | null,
      }));
      const customRuns = customIds.map((id, i) => {
        const p = positions[(builtinRuns.length + i) % positions.length];
        return {
          scan_id: scan.id,
          agent_type: "custom",
          status: "pending",
          position_x: p.x,
          position_y: p.y,
          custom_agent_id: id,
        };
      });
      const { error: runsErr } = await supabase
        .from("agent_runs")
        .insert([...builtinRuns, ...customRuns]);
      if (runsErr) throw runsErr;

      if (scheduledScanId) {
        await supabase
          .from("scheduled_scans")
          .update({ last_run_scan_id: scan.id })
          .eq("id", scheduledScanId);
      }

      const creds = {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        sessionToken: sessionToken.trim() || undefined,
        region,
      };
      saveCreds(creds);

      void runScan({ data: { scanId: scan.id, creds } }).catch((e) => {
        console.error(e);
        toast.error("Scan failed to start: " + (e instanceof Error ? e.message : "unknown"));
      });

      navigate({ to: "/scans/$scanId", params: { scanId: scan.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to launch scan");
      setLaunching(false);
    }
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
              › new scan
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/agents">
              <Button size="sm" variant="ghost">
                <Beaker className="mr-1.5 h-3.5 w-3.5" /> Custom agents
              </Button>
            </Link>
            <Link to="/schedules">
              <Button size="sm" variant="ghost">
                <Calendar className="mr-1.5 h-3.5 w-3.5" /> Schedules
              </Button>
            </Link>
            <Link to="/dashboard">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Launch a new scan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Read-only AWS credentials. Pick built-in or custom agents. Optionally save as a weekly
            drift baseline.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <AwsSetupGuide />

          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Scan details</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Scan name
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="prod-acct weekly"
                    className="mt-1 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Primary region
                  </Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="mt-1 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AWS_REGIONS.map((r) => (
                        <SelectItem key={r} value={r} className="font-mono">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">AWS credentials</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Stored only in this browser tab. Cleared when you close the tab.
              </p>
              <div className="mt-4 space-y-3">
                <div>
                  <Label htmlFor="ak" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Access key ID
                  </Label>
                  <Input id="ak" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIA…" autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label htmlFor="sk" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Secret access key
                  </Label>
                  <Input id="sk" type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label htmlFor="st" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Session token <span className="ml-1 normal-case tracking-normal">(optional)</span>
                  </Label>
                  <Input id="st" type="password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>Use a dedicated IAM user with read-only permissions. Never paste root keys.</span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Built-in agents</h3>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {AGENT_ORDER.map((t) => {
                  const a = AGENT_DEFINITIONS[t];
                  return (
                    <label
                      key={t}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors ${
                        selected[t] ? "border-primary/60 bg-primary/5" : "border-border hover:border-border/80"
                      }`}
                    >
                      <Checkbox checked={selected[t]} onCheckedChange={() => toggle(t)} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: a.colorVar }} />
                          <span className="text-sm font-medium text-foreground">{a.name}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground leading-snug">{a.tagline}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Custom agents</h3>
                <Link to="/agents" className="text-xs text-primary hover:underline">
                  Manage →
                </Link>
              </div>
              {customAgents.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  No custom agents yet. Define your own checks in the Custom agents page.
                </p>
              ) : (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {customAgents.map((c) => (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                        selectedCustom[c.id] ? "border-primary/60 bg-primary/5" : "border-border"
                      }`}
                    >
                      <Checkbox checked={!!selectedCustom[c.id]} onCheckedChange={() => toggleCustom(c.id)} className="mt-0.5" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="text-sm font-medium truncate">{c.name}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{c.description}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{c.services.join(", ")}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <label className="flex items-start gap-3 cursor-pointer">
                <Checkbox checked={saveAsSchedule} onCheckedChange={(v) => setSaveAsSchedule(v === true)} className="mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">Save as scheduled drift baseline</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cirrus will remind you when the next run is due and diff findings against this baseline.
                  </p>
                </div>
              </label>
              {saveAsSchedule && (
                <div className="mt-3 ml-7 flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Cadence:</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={cadenceDays}
                    onChange={(e) => setCadenceDays(parseInt(e.target.value) || 7)}
                    className="w-20 h-8 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              )}
            </section>

            <Button size="lg" className="w-full" onClick={launch} disabled={launching}>
              <Play className="mr-2 h-4 w-4" />
              {launching ? "Dispatching agents…" : "Launch scan"}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
