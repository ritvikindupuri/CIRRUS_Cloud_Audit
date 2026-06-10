import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CirrusLogo } from "@/components/cirrus-logo";
import { Plus, LogOut, Clock, Check, AlertCircle, Loader2, Beaker, Calendar } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DueSchedule {
  id: string;
  name: string;
  region: string;
  next_run_at: string;
}

interface Scan {
  id: string;
  name: string;
  aws_account_id: string | null;
  aws_account_alias: string | null;
  region: string;
  status: string;
  created_at: string;
  selected_agents: string[];
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Scans · Cirrus" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);
  const [dueSchedules, setDueSchedules] = useState<DueSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [{ data: scanData }, { data: schedData }] = await Promise.all([
        supabase
          .from("scans")
          .select(
            "id, name, aws_account_id, aws_account_alias, region, status, created_at, selected_agents",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("scheduled_scans")
          .select("id, name, region, next_run_at")
          .lte("next_run_at", new Date().toISOString())
          .order("next_run_at"),
      ]);
      if (active) {
        setScans((scanData ?? []) as Scan[]);
        setDueSchedules((schedData ?? []) as DueSchedule[]);
        setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel("scans:list")
      .on("postgres_changes", { event: "*", schema: "public", table: "scans" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "scheduled_scans" }, () => void load())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/dashboard">
            <CirrusLogo />
          </Link>
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
            <Link to="/scans/new">
              <Button size="sm">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> New scan
              </Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {dueSchedules.length > 0 && (
        <div className="border-b border-primary/40 bg-primary/5">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-primary" />
              <span className="font-medium">
                {dueSchedules.length} drift check{dueSchedules.length === 1 ? "" : "s"} due
              </span>
              <span className="text-muted-foreground truncate">
                — {dueSchedules.map((s) => s.name).join(", ")}
              </span>
            </div>
            <Link to="/schedules">
              <Button size="sm" variant="outline">
                Review schedules
              </Button>
            </Link>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Scans</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every autonomous scan Cirrus has run for you.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Loading scans…
          </div>
        ) : scans.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-16 text-center">
            <p className="text-sm text-muted-foreground">No scans yet.</p>
            <Link to="/scans/new" className="mt-4 inline-block">
              <Button>
                <Plus className="mr-1.5 h-4 w-4" /> Start your first scan
              </Button>
            </Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Scan</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">Region</th>
                  <th className="px-4 py-3 font-medium">Agents</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Started</th>
                </tr>
              </thead>
              <tbody>
                {scans.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-border last:border-0 hover:bg-surface/60 cursor-pointer"
                    onClick={() => navigate({ to: "/scans/$scanId", params: { scanId: s.id } })}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{s.name}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.aws_account_alias || s.aws_account_id || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {s.region}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {(s.selected_agents ?? []).join(", ")}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { label: string; icon: React.ComponentType<{ className?: string }>; cls: string }
  > = {
    pending: { label: "Queued", icon: Clock, cls: "text-muted-foreground" },
    running: { label: "Running", icon: Loader2, cls: "text-primary" },
    complete: { label: "Complete", icon: Check, cls: "text-emerald-400" },
    error: { label: "Failed", icon: AlertCircle, cls: "text-destructive" },
  };
  const v = map[status] ?? map.pending;
  const Icon = v.icon;
  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase ${v.cls}`}>
      <Icon className={`mr-1 h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} /> {v.label}
    </Badge>
  );
}
