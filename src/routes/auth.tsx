import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CirrusLogo } from "@/components/cirrus-logo";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in · Cirrus" },
      { name: "description", content: "Sign in to Cirrus — autonomous red-team agents for AWS." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/dashboard" },
        });
        if (error) throw error;
        toast.success("Account created");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="px-6 py-5">
        <Link to="/">
          <CirrusLogo />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <h1 className="font-mono text-xs uppercase tracking-[0.25em] text-primary">
              {mode === "signin" ? "Authenticate" : "Provision Operator"}
            </h1>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              {mode === "signin" ? "Welcome back, operator." : "Create your operator account."}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Cirrus runs autonomous red-team agents against your AWS accounts.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6">
            <form onSubmit={handleEmail} className="space-y-4">
              <div>
                <Label
                  htmlFor="email"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  required
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="operator@yourcorp.com"
                />
              </div>
              <div>
                <Label
                  htmlFor="password"
                  className="text-xs uppercase tracking-wider text-muted-foreground"
                >
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  required
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 font-mono text-sm"
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "No operator account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-primary hover:underline"
            >
              {mode === "signin" ? "Create one" : "Sign in"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
