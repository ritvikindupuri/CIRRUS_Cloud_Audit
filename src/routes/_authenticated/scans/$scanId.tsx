import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { ReactFlow, ReactFlowProvider, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { supabase } from "@/integrations/supabase/client";
import { AGENT_DEFINITIONS, type AgentType } from "@/lib/agents/definitions";
import { AgentNode, type AgentNodeData } from "@/components/agent-node";
import { AgentDetailPanel } from "@/components/agent-detail-panel";
import { FindingsList } from "@/components/findings-list";
import { CirrusLogo } from "@/components/cirrus-logo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { runScan } from "@/lib/scans.functions";
import { loadCreds } from "@/lib/aws-creds";
import { toast } from "sonner";

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
}
interface RunRow {
  id: string;
  scan_id: string;
  agent_type: AgentType;
  status: "pending" | "running" | "complete" | "error";
  summary: string | null;
  position_x: number;
  position_y: number;
}
interface FindingRow {
  id: string;
  scan_id: string;
  agent_run_id: string | null;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string | null;
  resource: string | null;
}

export const Route = createFileRoute("/_authenticated/scans/$scanId")({
  head: () => ({ meta: [{ title: "Scan · Cirrus" }] }),
  component: ScanDetail,
});

const nodeTypes = { agent: AgentNode };

function ScanDetail() {
  const { scanId } = useParams({ from: "/_authenticated/scans/$scanId" });
  const [scan, setScan] = useState<ScanRow | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [tab, setTab] = useState<"trace" | "findings">("trace");

  useEffect(() => {
    let active = true;

    async function load() {
      const [{ data: s }, { data: r }, { data: f }] = await Promise.all([
        supabase.from("scans").select("*").eq("id", scanId).maybeSingle(),
        supabase.from("agent_runs").select("*").eq("scan_id", scanId).order("created_at"),
        supabase.from("findings").select("*").eq("scan_id", scanId).order("created_at"),
      ]);
      if (!active) return;
      setScan((s ?? null) as ScanRow | null);
      setRuns((r ?? []) as RunRow[]);
      setFindings((f ?? []) as FindingRow[]);
      if (!selectedRunId && r && r.length > 0) setSelectedRunId(r[0].id);
    }
    void load();

    const channel = supabase
      .channel(`scan:${scanId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "scans", filter: `id=eq.${scanId}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_runs", filter: `scan_id=eq.${scanId}` }, () => void load())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "findings", filter: `scan_id=eq.${scanId}` }, (p) => {
        setFindings((prev) => [...prev, p.new as FindingRow]);
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [scanId, selectedRunId]);

  const nodes: Node<AgentNodeData>[] = useMemo(() => {
    return runs.map((r) => ({
      id: r.id,
      type: "agent",
      position: { x: r.position_x, y: r.position_y },
      data: {
        agent: AGENT_DEFINITIONS[r.agent_type],
        status: r.status,
        findingsCount: findings.filter((f) => f.agent_run_id === r.id).length,
        selected: selectedRunId === r.id,
        onSelect: () => setSelectedRunId(r.id),
      },
    }));
  }, [runs, findings, selectedRunId]);

  const edges: Edge[] = useMemo(() => {
    // Recon is the "source"; everything else hangs off recon.
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

  const onNodeClick = useCallback((_: unknown, node: Node) => setSelectedRunId(node.id), []);

  function retry() {
    const creds = loadCreds();
    if (!creds) {
      toast.error("AWS credentials are no longer in this tab. Start a new scan to re-enter them.");
      return;
    }
    void runScan({ data: { scanId, creds } }).then(() => toast.success("Scan re-dispatched")).catch((e) =>
      toast.error(e instanceof Error ? e.message : "Failed"),
    );
  }

  const severityCounts = findings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link to="/dashboard"><CirrusLogo /></Link>
            <span className="text-muted-foreground">/</span>
            <div>
              <div className="text-sm font-medium text-foreground">{scan?.name ?? "…"}</div>
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {scan?.aws_account_alias || scan?.aws_account_id || "account pending"} · {scan?.region}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(["critical","high","medium","low","info"] as const).map((s) =>
              severityCounts[s] ? (
                <Badge key={s} variant="outline" className={`font-mono text-[10px] uppercase severity-${s}`}>
                  {severityCounts[s]} {s}
                </Badge>
              ) : null
            )}
            <Badge variant="outline" className="font-mono text-[10px] uppercase">{scan?.status}</Badge>
            {scan?.status === "error" && (
              <Button size="sm" variant="outline" onClick={retry}>
                <RotateCw className="mr-1.5 h-3.5 w-3.5" /> Retry
              </Button>
            )}
            <Link to="/dashboard">
              <Button size="sm" variant="ghost"><ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Scans</Button>
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
        {/* Canvas */}
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

        {/* Side panel */}
        <aside className="flex w-[480px] flex-col border-l border-border bg-background">
          <Tabs value={tab} onValueChange={(v) => setTab(v as "trace" | "findings")} className="flex h-full flex-col">
            <div className="border-b border-border px-3 pt-2">
              <TabsList className="bg-transparent p-0 gap-1">
                <TabsTrigger value="trace" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                  Agent trace
                </TabsTrigger>
                <TabsTrigger value="findings" className="rounded-md data-[state=active]:bg-surface data-[state=active]:border data-[state=active]:border-border">
                  Findings · {findings.length}
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="trace" className="flex-1 overflow-hidden m-0">
              <AgentDetailPanel run={selectedRun} />
            </TabsContent>
            <TabsContent value="findings" className="flex-1 overflow-auto m-0 p-3">
              <FindingsList findings={findings} />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}
