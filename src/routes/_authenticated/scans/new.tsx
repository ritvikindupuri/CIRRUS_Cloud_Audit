import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CirrusLogo } from "@/components/cirrus-logo";
import { AwsSetupGuide } from "@/components/aws-setup-guide";
import { AGENT_DEFINITIONS, AGENT_ORDER, AWS_REGIONS, type AgentType } from "@/lib/agents/definitions";
import { saveCreds } from "@/lib/aws-creds";
import { runScan } from "@/lib/scans.functions";
import { ArrowLeft, Play, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

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
  const [selected, setSelected] = useState<Record<AgentType, boolean>>({
    recon: true, iam: true, s3: true, ec2: true,
  });
  const [launching, setLaunching] = useState(false);

  function toggle(t: AgentType) {
    setSelected((p) => ({ ...p, [t]: !p[t] }));
  }

  async function launch() {
    const agents = AGENT_ORDER.filter((t) => selected[t]);
    if (agents.length === 0) return toast.error("Pick at least one agent.");
    if (!accessKeyId || !secretAccessKey) return toast.error("AWS access key and secret are required.");
    if (!name.trim()) return toast.error("Give this scan a name.");

    setLaunching(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");

      const { data: scan, error: scanErr } = await supabase
        .from("scans")
        .insert({
          user_id: userData.user.id,
          name: name.trim(),
          region,
          status: "pending",
          selected_agents: agents,
        })
        .select("id")
        .single();
      if (scanErr || !scan) throw scanErr ?? new Error("Failed to create scan");

      const positions = [
        { x: 0, y: 0 },
        { x: 320, y: -120 },
        { x: 320, y: 120 },
        { x: 640, y: 0 },
      ];
      const runsPayload = agents.map((agent_type, i) => ({
        scan_id: scan.id,
        agent_type,
        status: "pending",
        position_x: positions[i % positions.length].x,
        position_y: positions[i % positions.length].y,
      }));
      const { error: runsErr } = await supabase.from("agent_runs").insert(runsPayload);
      if (runsErr) throw runsErr;

      const creds = {
        accessKeyId: accessKeyId.trim(),
        secretAccessKey: secretAccessKey.trim(),
        sessionToken: sessionToken.trim() || undefined,
        region,
      };
      saveCreds(creds);

      // Fire-and-forget: server fn will run all agents in parallel; user follows along on the scan page.
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
            <Link to="/dashboard"><CirrusLogo /></Link>
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              › new scan
            </span>
          </div>
          <Link to="/dashboard">
            <Button size="sm" variant="ghost"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Launch a new scan</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Provide read-only AWS credentials and pick which agents should investigate. Keys never
            leave your browser except for the duration of this scan.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.05fr]">
          <AwsSetupGuide />

          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Scan details</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="name" className="text-xs uppercase tracking-wider text-muted-foreground">Scan name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="prod-acct weekly" className="mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Primary region</Label>
                  <Select value={region} onValueChange={setRegion}>
                    <SelectTrigger className="mt-1 font-mono"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {AWS_REGIONS.map((r) => <SelectItem key={r} value={r} className="font-mono">{r}</SelectItem>)}
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
                  <Label htmlFor="ak" className="text-xs uppercase tracking-wider text-muted-foreground">Access key ID</Label>
                  <Input id="ak" value={accessKeyId} onChange={(e) => setAccessKeyId(e.target.value)} placeholder="AKIA…" autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label htmlFor="sk" className="text-xs uppercase tracking-wider text-muted-foreground">Secret access key</Label>
                  <Input id="sk" type="password" value={secretAccessKey} onChange={(e) => setSecretAccessKey(e.target.value)} autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
                <div>
                  <Label htmlFor="st" className="text-xs uppercase tracking-wider text-muted-foreground">Session token <span className="ml-1 normal-case tracking-normal">(optional, for STS temp creds)</span></Label>
                  <Input id="st" type="password" value={sessionToken} onChange={(e) => setSessionToken(e.target.value)} autoComplete="off" className="mt-1 font-mono text-sm" />
                </div>
              </div>
              <div className="mt-4 flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-muted-foreground">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>
                  We strongly recommend a dedicated IAM user with only the policy from the setup guide.
                  Don't paste your root keys.
                </span>
              </div>
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold">Agents to dispatch</h3>
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
