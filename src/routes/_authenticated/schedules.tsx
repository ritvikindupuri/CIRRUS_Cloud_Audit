import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CirrusLogo } from "@/components/cirrus-logo";
import { ArrowLeft, Calendar, Trash2, Play, AlertCircle, Clock, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { runScheduledScan } from "@/lib/scans.functions";
import { loadCreds, saveCreds } from "@/lib/aws-creds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface Schedule {
  id: string;
  name: string;
  region: string;
  selected_agents: string[];
  custom_agent_ids: string[];
  cadence_days: number;
  last_run_scan_id: string | null;
  next_run_at: string;
  created_at: string;
}

export const Route = createFileRoute("/_authenticated/schedules")({
  head: () => ({ meta: [{ title: "Schedules · Cirrus" }] }),
  component: SchedulesPage,
});

function SchedulesPage() {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [credsDialogFor, setCredsDialogFor] = useState<Schedule | null>(null);
  const [ak, setAk] = useState("");
  const [sk, setSk] = useState("");
  const [st, setSt] = useState("");

  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [resendApiKey, setResendApiKey] = useState("");
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [savingResend, setSavingResend] = useState(false);

  async function load() {
    const { data } = await supabase.from("scheduled_scans").select("*").order("next_run_at");
    setSchedules((data ?? []) as Schedule[]);
  }

  async function loadResendConfig() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    const { data: profile } = await supabase
      .from("profiles")
      .select("resend_api_key, resend_from_email")
      .eq("id", userData.user.id)
      .single();
    if (profile) {
      setResendApiKey(profile.resend_api_key ?? "");
      setResendFromEmail(profile.resend_from_email ?? "");
    }
  }

  useEffect(() => {
    void load();
    void loadResendConfig();
  }, []);

  async function saveResendConfig() {
    setSavingResend(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Not signed in");
      const { error } = await supabase
        .from("profiles")
        .update({
          resend_api_key: resendApiKey.trim() || null,
          resend_from_email: resendFromEmail.trim() || null,
        })
        .eq("id", userData.user.id);
      if (error) throw error;
      toast.success("Resend settings updated");
      setResendDialogOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSavingResend(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this schedule? Past scans are kept.")) return;
    const { error } = await supabase.from("scheduled_scans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  }

  function startRun(s: Schedule) {
    const cached = loadCreds();
    if (cached && cached.region === s.region) {
      void execute(s, cached);
      return;
    }
    setAk("");
    setSk("");
    setSt("");
    setCredsDialogFor(s);
  }

  async function execute(
    s: Schedule,
    creds: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; region: string },
  ) {
    try {
      const { scanId } = await runScheduledScan({ data: { scheduleId: s.id, creds } });
      saveCreds(creds);
      toast.success("Drift check dispatched");
      navigate({ to: "/scans/$scanId", params: { scanId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  function submitCreds() {
    if (!credsDialogFor) return;
    if (!ak.trim() || !sk.trim()) return toast.error("Access key + secret required");
    void execute(credsDialogFor, {
      accessKeyId: ak.trim(),
      secretAccessKey: sk.trim(),
      sessionToken: st.trim() || undefined,
      region: credsDialogFor.region,
    });
    setCredsDialogFor(null);
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
              › drift schedules
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
        <div className="mb-8 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Drift detection schedules</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Periodically re-run the same scan and diff findings against the previous baseline. Since
              AWS credentials are never stored server-side, Cirrus reminds you when a check is due and
              you re-enter them in this tab.
            </p>
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => setResendDialogOpen(true)}>
            <Mail className="mr-1.5 h-3.5 w-3.5" /> Email alerts settings
          </Button>
        </div>

        {schedules.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-16 text-center">
            <Calendar className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No schedules yet. From the New scan page, tick "Save as scheduled drift baseline" to
              create one.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((s) => {
              const due = new Date(s.next_run_at).getTime() <= Date.now();
              const agentCount = s.selected_agents.length + s.custom_agent_ids.length;
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border bg-card p-4 ${due ? "border-primary/60" : "border-border"}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {due ? (
                          <AlertCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="font-medium">{s.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          {s.region}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Every {s.cadence_days} day{s.cadence_days === 1 ? "" : "s"} · {agentCount}{" "}
                        agent{agentCount === 1 ? "" : "s"} · {due ? (
                          <span className="text-primary font-medium">Due now</span>
                        ) : (
                          <>Next run {formatDistanceToNow(new Date(s.next_run_at), { addSuffix: true })}</>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => startRun(s)}>
                        <Play className="mr-1.5 h-3.5 w-3.5" /> Run now
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={!!credsDialogFor} onOpenChange={(o) => !o && setCredsDialogFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>AWS credentials for drift check</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Cirrus does not store AWS keys. Re-enter the read-only keys for "
              {credsDialogFor?.name}" to run this drift check.
            </p>
            <div>
              <Label className="text-xs">Access key ID</Label>
              <Input value={ak} onChange={(e) => setAk(e.target.value)} className="mt-1 font-mono text-sm" autoComplete="off" />
            </div>
            <div>
              <Label className="text-xs">Secret access key</Label>
              <Input type="password" value={sk} onChange={(e) => setSk(e.target.value)} className="mt-1 font-mono text-sm" autoComplete="off" />
            </div>
            <div>
              <Label className="text-xs">Session token (optional)</Label>
              <Input type="password" value={st} onChange={(e) => setSt(e.target.value)} className="mt-1 font-mono text-sm" autoComplete="off" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCredsDialogFor(null)}>
              Cancel
            </Button>
            <Button onClick={submitCreds}>Run drift check</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email Alerts Configuration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cirrus sends email alerts when scheduled drift checks become due. You can configure your own personal **Resend API Key** and **From Email** sender address below.
            </p>
            <div>
              <Label className="text-xs font-medium">Resend API Key</Label>
              <Input 
                type="password"
                value={resendApiKey} 
                onChange={(e) => setResendApiKey(e.target.value)} 
                placeholder="re_..."
                className="mt-1 font-mono text-sm" 
                autoComplete="off" 
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Get a key from your <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline text-primary hover:text-primary/80">Resend Console</a>.
              </p>
            </div>
            <div>
              <Label className="text-xs font-medium">Sender From Email (Optional)</Label>
              <Input 
                value={resendFromEmail} 
                onChange={(e) => setResendFromEmail(e.target.value)} 
                placeholder="Cirrus Security <onboarding@resend.dev>"
                className="mt-1 text-sm" 
                autoComplete="off" 
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Must be verified in your Resend account. Defaults to <code className="font-mono">onboarding@resend.dev</code> if left blank.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResendDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveResendConfig} disabled={savingResend}>
              {savingResend ? "Saving..." : "Save settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
