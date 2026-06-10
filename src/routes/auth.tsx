import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
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

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) return;
    window.location.href = "/dashboard";
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
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={loading}
              className="w-full"
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.75h3.55c2.08-1.92 3.29-4.74 3.29-8.08Z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.67l-3.55-2.75c-.98.66-2.24 1.05-3.73 1.05-2.87 0-5.3-1.94-6.16-4.55H2.18v2.84A11 11 0 0 0 12 23Z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.08A6.61 6.61 0 0 1 5.48 12c0-.73.13-1.43.36-2.08V7.08H2.18a11 11 0 0 0 0 9.84l3.66-2.84Z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.07.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.08l3.66 2.84C6.7 7.31 9.13 5.38 12 5.38Z"
                />
              </svg>
              Continue with Google
            </Button>

            <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              OR
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmail} className="space-y-3">
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
