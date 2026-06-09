import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CirrusLogo } from "@/components/cirrus-logo";
import { ArrowRight, Radar, Key, Network, Container, GitBranch, Terminal, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cirrus — Autonomous red-team agents for AWS" },
      { name: "description", content: "Cirrus runs a fleet of autonomous LLM agents against your AWS account — IAM, S3, EC2 — and shows every command, every output, every finding, live on a node canvas." },
      { property: "og:title", content: "Cirrus — Autonomous red-team agents for AWS" },
      { property: "og:description", content: "A live, agentic pentest workbench for AWS cloud security engineers." },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <CirrusLogo />
          <nav className="flex items-center gap-2">
            <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
            <Link to="/auth"><Button size="sm">Launch a scan <ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></Link>
          </nav>
        </div>
      </header>

      <main>
        {/* HERO */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,oklch(0.78_0.17_55/0.10),transparent_60%)]" />
          <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-24 text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary pulse-running" />
              v0.1 · LLM-driven cloud red team
            </div>
            <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-semibold tracking-tight md:text-6xl">
              Autonomous red-team agents
              <span className="block bg-gradient-to-r from-primary via-amber-300 to-primary bg-clip-text text-transparent">
                for your AWS account.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              Cirrus dispatches a fleet of specialized LLM agents — Recon, IAM, S3, EC2 — against your
              AWS environment. Watch every command, every API call, every finding stream in live, on
              a node canvas that thinks like you do.
            </p>
            <div className="mt-9 flex items-center justify-center gap-3">
              <Link to="/auth">
                <Button size="lg" className="font-medium">
                  Start a free scan <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <a href="#how">
                <Button size="lg" variant="outline">How it works</Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Read-only IAM. Keys stay in your browser. Nothing persisted server-side.
            </p>
          </div>
        </section>

        {/* AGENTS */}
        <section id="how" className="border-y border-border/60 bg-surface/50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="text-center">
              <span className="font-mono text-xs uppercase tracking-[0.25em] text-primary">The fleet</span>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Four agents. One canvas.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
                Each agent has its own system prompt, its own tools, and its own opinion. They run in
                parallel and surface findings as soon as they see them.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Radar, name: "Recon", color: "var(--color-agent-recon)", text: "Maps identity, account aliases, enabled regions, and account-level posture." },
                { icon: Key, name: "IAM Auditor", color: "var(--color-agent-iam)", text: "Hunts AdministratorAccess, stale access keys, wildcard policies, privilege escalation paths." },
                { icon: Container, name: "S3 Hunter", color: "var(--color-agent-s3)", text: "Public buckets, missing access blocks, unencrypted data — graded by blast radius." },
                { icon: Network, name: "EC2 / Network", color: "var(--color-agent-ec2)", text: "Security groups open to 0.0.0.0/0, exposed instances, dangerous database ports." },
              ].map((a) => (
                <div key={a.name} className="rounded-lg border border-border bg-card p-5">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-md"
                    style={{ backgroundColor: a.color, color: "oklch(0.15 0.012 260)" }}
                  >
                    <a.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-3 font-semibold">{a.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* DIFFERENTIATORS */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="grid gap-6 md:grid-cols-3">
            <Feature icon={GitBranch} title="n8n-style node canvas">
              Every agent is a node. Click one to dive into its reasoning trace. Drag, zoom, follow
              the live execution path.
            </Feature>
            <Feature icon={Terminal} title="See every command and output">
              No black-box. Cirrus shows you the exact AWS API call each agent decided to run, and the
              raw JSON response it got back.
            </Feature>
            <Feature icon={ShieldCheck} title="Built for AWS sec engineers">
              Cirrus isn't an AWS-native product. It thinks like a red-teamer, not a compliance
              checklist. Findings come with evidence and resource ARNs.
            </Feature>
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border/60">
          <div className="mx-auto max-w-3xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Point Cirrus at an account.</h2>
            <p className="mt-3 text-muted-foreground">
              Three minutes to spin up a read-only IAM user. Then watch the agents work.
            </p>
            <div className="mt-6">
              <Link to="/auth"><Button size="lg">Launch your first scan <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <CirrusLogo size={20} />
          <span className="font-mono">cirrus / v0.1</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
