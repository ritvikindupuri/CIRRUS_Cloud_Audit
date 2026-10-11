import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CirrusLogo } from '@/components/cirrus-logo';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FindingsList } from '@/components/findings-list';
import {
  ArrowLeft,
  Search,
  ShieldAlert,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface FindingRow {
  id: string;
  scan_id: string;
  agent_run_id: string | null;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string | null;
  resource: string | null;
  remediation?: Record<string, unknown> | null;
  created_at: string;
}

interface ScanMeta {
  id: string;
  name: string;
  region: string;
}

export const Route = createFileRoute('/_authenticated/findings')({
  ssr: false,
  head: () => ({ meta: [{ title: 'All Findings · Cirrus' }] }),
  component: AllFindingsPage,
});

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

function AllFindingsPage() {
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [scans, setScans] = useState<Record<string, ScanMeta>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  async function loadData() {
    setLoading(true);
    try {
      const [{ data: fData }, { data: sData }] = await Promise.all([
        supabase
          .from('findings')
          .select('*')
          .order('created_at', { ascending: false }),
        supabase.from('scans').select('id, name, region'),
      ]);

      setFindings((fData ?? []) as FindingRow[]);
      const sMap: Record<string, ScanMeta> = {};
      for (const s of (sData ?? []) as ScanMeta[]) {
        sMap[s.id] = s;
      }
      setScans(sMap);
    } catch (err) {
      console.error('Failed to load global findings:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredFindings = useMemo(() => {
    return findings
      .filter((f) => {
        const s = (f.severity || 'info').toLowerCase();
        if (severityFilter !== 'all' && s !== severityFilter.toLowerCase()) {
          return false;
        }
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = (f.title ?? '').toLowerCase().includes(q);
          const res = f.resource || (f as any).resource_id || '';
          const matchResource = res.toLowerCase().includes(q);
          const matchDesc = (f.description ?? '').toLowerCase().includes(q);
          return matchTitle || matchResource || matchDesc;
        }
        return true;
      })
      .sort((a, b) => {
        const diff =
          (SEVERITY_RANK[a.severity?.toLowerCase()] ?? 99) -
          (SEVERITY_RANK[b.severity?.toLowerCase()] ?? 99);
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [findings, severityFilter, search]);

  const counts = useMemo(() => {
    return findings.reduce<Record<string, number>>((acc, f) => {
      const s = (f.severity || 'info').toLowerCase();
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    }, {});
  }, [findings]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <CirrusLogo />
            </Link>
            <span className="text-muted-foreground">/</span>
            <div className="text-sm font-medium text-foreground flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-primary" />
              Global Findings Inventory
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/dashboard">
              <Button size="sm" variant="ghost">
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Cross-Resource Findings</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consolidated security findings sorted by criticality across all audited AWS resources and scans.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(["critical", "high", "medium", "low", "info"] as const).map((s) => {
              const cls: Record<typeof s, string> = {
                critical: "border-severity-critical/40 text-severity-critical",
                high: "border-severity-high/40 text-severity-high",
                medium: "border-severity-medium/40 text-severity-medium",
                low: "border-severity-low/40 text-severity-low",
                info: "border-severity-info/40 text-severity-info",
              };
              return counts[s] ? (
                <Badge
                  key={s}
                  variant="outline"
                  className={`cursor-pointer font-mono text-[11px] uppercase transition-all ${cls[s]} ${
                    severityFilter === s ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                  }`}
                  onClick={() => setSeverityFilter(severityFilter === s ? "all" : s)}
                >
                  {counts[s]} {s}
                </Badge>
              ) : null;
            })}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="mb-6 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by finding title, resource ARN, or description..."
              className="pl-9 h-9 text-xs"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="info">Informational</option>
            </select>
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Findings List with Pre-Remediation Diffs, Audio, & Snapshot Ledger */}
        {loading ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            Loading findings across cloud resources...
          </div>
        ) : filteredFindings.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
            No matching findings discovered.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Displaying {filteredFindings.length} finding{filteredFindings.length === 1 ? "" : "s"} (Sorted by Criticality)</span>
              {severityFilter !== "all" && (
                <button
                  onClick={() => setSeverityFilter("all")}
                  className="text-primary hover:underline text-[11px] normal-case"
                >
                  Clear filter
                </button>
              )}
            </div>
            <FindingsList findings={filteredFindings} />
          </div>
        )}
      </main>
    </div>
  );
}
