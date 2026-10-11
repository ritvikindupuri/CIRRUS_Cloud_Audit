import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { getAgentDefinition, type AgentType } from "@/lib/agents/definitions";
import { AgentNode, type AgentNodeData } from "@/components/agent-node";
import { AgentDetailPanel } from "@/components/agent-detail-panel";
import { FindingsList } from "@/components/findings-list";
import { DriftDiff } from "@/components/drift-diff";
import { ExecutionTimeline } from "@/components/execution-timeline";
import { CirrusLogo } from "@/components/cirrus-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCw, Download, GitCompare, Clock, Loader2, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { runScan, generateRemediation, deleteScan } from "@/lib/scans.functions";
import { loadCreds } from "@/lib/aws-creds";
import { toast } from "sonner";
import { generateSecurityReport } from "@/lib/report-generator";

interface ScanRow {
  id: string;
  name: string;
  region: string;
  status: string;
  aws_account_id: string | null;
  aws_account_alias: string | null;
  selected_agents: string[];
  created_at: string;
  error_message: string | null;
  parent_scan_id: string | null;
  scheduled_scan_id: string | null;
}
interface RunRow {
  id: string;
  scan_id: string;
  agent_type: AgentType;
  status: "pending" | "running" | "complete" | "error";
  summary: string | null;
  position_x: number;
  position_y: number;
  custom_agent_id: string | null;
}
interface FindingRow {
  id: string;
  scan_id: string;
  agent_run_id: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
  remediation: Record<string, unknown> | null;
}
interface CustomAgentRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
}

export const Route = createFileRoute("/_authenticated/scans/$scanId")({
  ssr: false,
  head: () => ({ meta: [{ title: "Scan · Cirrus" }] }),
  component: ScanDetail,
});

const nodeTypes = { agent: AgentNode };

function ScanDetail() {
  const { scanId } = useParams({ from: "/_authenticated/scans/$scanId" });
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [parentFindings, setParentFindings] = useState<FindingRow[] | null>(null);
  const [customAgents, setCustomAgents] = useState<Record<string, CustomAgentRow>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<"trace" | "timeline" | "findings" | "drift">("trace");
  const [downloading, setDownloading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [{ data: s, error: sErr }, { data: r, error: rErr }, { data: f, error: fErr }] = await Promise.all([
          supabase.from("scans").select("*").eq("id", scanId).maybeSingle(),
          supabase.from("agent_runs").select("*").eq("scan_id", scanId).order("created_at"),
          supabase.from("findings").select("*").eq("scan_id", scanId).order("created_at"),
        ]);
        if (sErr) throw sErr;
        if (rErr) throw rErr;
        if (fErr) throw fErr;
        if (!active) return;
        setScan((s ?? null) as ScanRow | null);
        setRuns((r ?? []) as RunRow[]);
        setFindings((f ?? []) as FindingRow[]);
        setSelectedRunId((prev) => prev ?? (r && r.length > 0 ? r[0].id : null));

        const customIds = (r ?? [])
          .map((x) => x.custom_agent_id)
          .filter((x): x is string => !!x);
        if (customIds.length > 0) {
          const { data: customs } = await supabase
            .from("custom_agents")
            .select("id, name, description, color")
            .in("id", customIds);
          const map: Record<string, CustomAgentRow> = {};
          for (const c of customs ?? []) map[c.id] = c as CustomAgentRow;
          if (active) setCustomAgents(map);
        }

        const parentId = (s as ScanRow | null)?.parent_scan_id;
        if (parentId) {
          const { data: pf } = await supabase.from("findings").select("*").eq("scan_id", parentId);
          if (active) setParentFindings((pf ?? []) as FindingRow[]);
        }
      } catch (err) {
        console.error("[ScanDetail Load Error]", err);
        if (active) setLoadError((err as any)?.message || String(err));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();

    const channel = supabase
      .channel(`scan:${scanId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scans", filter: `id=eq.${scanId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `scan_id=eq.${scanId}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "findings", filter: `scan_id=eq.${scanId}` }, (p) => {
        setFindings((prev) => [...prev, p.new as FindingRow]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "findings", filter: `scan_id=eq.${scanId}` }, (p) => {
        setFindings((prev) => prev.map((f) => (f.id === (p.new as FindingRow).id ? (p.new as FindingRow) : f)));
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [scanId]);

  const nodes: Node<AgentNodeData>[] = useMemo(() => {
    return runs.map((r) => {
      const custom = r.custom_agent_id ? customAgents[r.custom_agent_id] : undefined;
      const def = getAgentDefinition(r.agent_type, custom);
      const runFindings = findings.filter((f) => f.agent_run_id === r.id);
      return {
        id: r.id,
        type: "agent",
        position: { x: r.position_x, y: r.position_y },
        data: {
          agent: def,
          status: r.status,
          findingsCount: runFindings.length,
          severityCounts: {
            critical: runFindings.filter((f) => f.severity === "critical").length,
            high: runFindings.filter((f) => f.severity === "high").length,
            medium: runFindings.filter((f) => f.severity === "medium").length,
            low: runFindings.filter((f) => f.severity === "low").length,
            info: runFindings.filter((f) => f.severity === "info").length,
          },
          selected: selectedRunId === r.id,
          onSelect: () => setSelectedRunId(r.id),
        },
      };
    });
  }, [runs, findings, selectedRunId, customAgents]);

  const edges: Edge[] = useMemo(() => {
    const recon = runs.find((r) => r.agent_type === "recon");
    if (!recon) return [];
    return runs
      .filter((r) => r.id !== recon.id)
      .map((r) => ({
        id: `${recon.id}->${r.id}`,
        source: recon.id,
        target: r.id,
        animated: r.status === "running" || recon.status === "running",
        style: { stroke: "var(--color-border)" },
      }));
  }, [runs]);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? null;
  const selectedRunWithCustom = selectedRun
    ? {
        ...selectedRun,
        custom_agent: selectedRun.custom_agent_id ? customAgents[selectedRun.custom_agent_id] ?? null : null,
      }
    : null;

  const onNodeClick = useCallback((_: unknown, node: Node) => setSelectedRunId(node.id), []);

  function retry() {
    const creds = loadCreds();
    if (!creds) {
      toast.error("AWS credentials are no longer in this tab. Start a new scan to re-enter them.");
      return;
    }
    void runScan({ data: { scanId, creds } })
      .then(() => toast.success("Scan re-dispatched"))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"));
  }

  async function handleDownloadReport() {
    if (!scan) return;
    setDownloading(true);
    try {
      const missingRemediations = findings.filter((f) => !f.remediation);
      let updatedFindings = [...findings];

      if (missingRemediations.length > 0) {
        toast.info(`Generating ${missingRemediations.length} remediation playbook(s) for the report...`);
        const results = await Promise.all(
          missingRemediations.map(async (f) => {
            try {
              const rem = await generateRemediation({ data: { findingId: f.id } });
              return { id: f.id, remediation: rem };
            } catch (err) {
              console.error(`Failed to generate remediation for finding ${f.id}:`, err);
              return { id: f.id, remediation: null };
            }
          })
        );

        updatedFindings = findings.map((f) => {
          const res = results.find((r) => r.id === f.id);
          if (res && res.remediation) {
            return { ...f, remediation: res.remediation as any };
          }
          return f;
        });

        setFindings(updatedFindings);
      }

      generateSecurityReport(scan as any, updatedFindings as any);
      toast.success("Security report downloaded successfully.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download report");
    } finally {
      setDownloading(false);
    }
  }

  async function handleDelete() {
    if (!scan) return;
    if (!confirm(`Are you sure you want to delete scan "${scan.name}"? This cannot be undone.`)) {
      return;
    }
    setDeleting(true);
    try {
      await deleteScan({ data: { scanId } });
      toast.success("Scan deleted successfully");
      navigate({ to: "/dashboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete scan");
      setDeleting(false);
    }
  }

  if (loading && !scan) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
          Loading scan session...
        </p>
      </div>
    );
  }

  if (loadError && !scan) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Scan Not Found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Link to="/dashboard">
              <Button size="sm" variant="outline">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const severityCounts = findings.reduce<Record<string, number>>((acc, f) => {
    const s = (f.severity || "info").toLowerCase();
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <CirrusLogo />
            </Link>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-sm font-medium text-foreground">{scan?.name ?? "…"}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {scan?.aws_account_alias || scan?.aws_account_id || "account pending"} · {scan?.region}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["critical", "high", "medium", "low", "info"] as const).map((s) => {
              const cls: Record<typeof s, string> = {
                critical: "text-severity-critical",
                high: "text-severity-high",
                medium: "text-severity-medium",
                low: "text-severity-low",
                info: "text-severity-info",
              };
              return severityCounts[s] ? (
                <Badge key={s} variant="outline" className={`font-mono text-[10px] uppercase ${cls[s]}`}>
                  {severityCounts[s]} {s}
                </Badge>
              ) : null;
            })}
            <Badge variant="outline" className="font-mono text-[10px] uppercase">{scan?.status}</Badge>
            {scan?.status === "complete" && (
              <Button size="sm" variant="outline" onClick={handleDownloadReport} disabled={downloading}>
                {downloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                {downloading ? "Generating Report..." : "Download Report"}
              </Button>
            )}
            {scan?.status === "error" && (
              <Button size="sm" variant="outline" onClick={retry}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={handleDelete}
              disabled={deleting}
              title="Delete scan"
            >
              {deleting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              )}
              Delete
            </Button>
            <Link to="/dashboard">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Scans
              </Button>
            </Link>
          </div>
        </div>
        {scan?.error_message && (
          <div className="border-t border-destructive/40 bg-destructive/10 px-6 py-2 text-xs text-destructive">
            {scan.error_message}
          </div>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodeClick={onNodeClick}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              minZoom={0.4}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="var(--color-grid)" gap={24} size={1} />
              <Controls className="!bg-card !border !border-border" />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <aside className="flex w-[480px] flex-col border-l border-border bg-background">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex h-full flex-col">
            <div className="border-b border-border px-3 pt-2">
              <TabsList className="bg-transparent p-0 gap-1">
                <TabsTrigger value="trace" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                  Agent trace
                </TabsTrigger>
                <TabsTrigger value="timeline" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                  <Clock className="mr-1 h-3 w-3" />
                  Timeline
                </TabsTrigger>
                <TabsTrigger value="findings" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                  Findings · {findings.length}
                </TabsTrigger>
                {parentFindings && (
                  <TabsTrigger value="drift" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                    <GitCompare className="mr-1 h-3 w-3" />
                    Drift
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
            <TabsContent value="trace" className="flex-1 overflow-hidden m-0">
              <AgentDetailPanel run={selectedRunWithCustom} />
            </TabsContent>
            <TabsContent value="timeline" className="flex-1 overflow-hidden m-0">
              <ExecutionTimeline
                scanId={scanId}
                runs={runs.map((r) => ({
                  id: r.id,
                  agent_type: r.agent_type,
                  custom_agent_id: r.custom_agent_id,
                  custom_agent: r.custom_agent_id ? customAgents[r.custom_agent_id] ?? null : null,
                }))}
              />
            </TabsContent>
            <TabsContent value="findings" className="flex-1 overflow-auto m-0 p-3">
              <FindingsList findings={findings} />
            </TabsContent>
            {parentFindings && (
              <TabsContent value="drift" className="flex-1 overflow-auto m-0 p-3">
                <DriftDiff current={findings} previous={parentFindings} />
              </TabsContent>
            )}
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
