import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CirrusLogo } from "@/components/cirrus-logo";
import { ArrowRight, Bot, GitBranch, ShieldAlert } from "lucide-react";
import { motion, type Variants } from "framer-motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cirrus — Autonomous red-team agents for AWS" },
      {
        name: "description",
        content: "Cirrus runs a fleet of autonomous LLM agents against your AWS account.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring" as const,
        stiffness: 70,
        damping: 20,
      },
    },
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans overflow-x-hidden">
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <CirrusLogo size={56} />
          <nav className="flex items-center gap-4">
            <Link to="/auth">
              <Button
                variant="ghost"
                className="text-sm font-medium hover:bg-transparent hover:text-primary transition-colors"
              >
                Sign in
              </Button>
            </Link>
            <Link to="/auth">
              <Button className="rounded-full px-6 text-sm font-medium shadow-sm hover:shadow-md transition-all">
                Get Started
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-24 min-h-screen flex items-center px-6 mx-auto max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-8 items-center w-full">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col items-start text-left"
          >
            <motion.h1
              variants={itemVariants}
              className="text-6xl md:text-8xl font-medium tracking-tight text-foreground leading-[1.1] mb-6"
            >
              Security, <br />
              <span className="text-muted-foreground">simplified.</span>
            </motion.h1>

            <motion.p
              variants={itemVariants}
              className="text-xl md:text-2xl text-muted-foreground max-w-xl font-light leading-relaxed mb-8"
            >
              Autonomous red-team agents that map and test your AWS environment flawlessly.
            </motion.p>

            <motion.div
              variants={itemVariants}
              className="flex flex-col sm:flex-row items-center gap-4 mb-16"
            >
              <Link to="/auth">
                <Button
                  size="lg"
                  className="rounded-full h-14 px-8 text-lg font-medium shadow-lg hover:scale-105 transition-transform duration-300"
                >
                  Start your scan <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>

            {/* Features List */}
            <motion.div variants={containerVariants} className="space-y-8 max-w-lg">
              <motion.div variants={itemVariants} className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-100/50 flex items-center justify-center text-orange-600">
                  <Bot className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg mb-1">
                    Autonomous Red-Teaming
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Deploy intelligent agents that continuously probe your AWS infrastructure for
                    vulnerabilities.
                  </p>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-100/50 flex items-center justify-center text-orange-600">
                  <GitBranch className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg mb-1">
                    Interactive Attack Graphs
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Visualize execution paths and understand exactly how agents navigate your
                    environment.
                  </p>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="flex gap-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-orange-100/50 flex items-center justify-center text-orange-600">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-lg mb-1">
                    Actionable Findings
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Get real-time, prioritized security insights with precise context to remediate
                    risks faster.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.8, type: "spring", stiffness: 50 }}
            className="relative flex items-center justify-center"
          >
            {/* Warm radial background glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-orange-500/15 rounded-full blur-[120px] pointer-events-none" />

            <CirrusLogo
              size={380}
              withWordmark={false}
              className="opacity-95 relative z-10"
              isometric={true}
            />
          </motion.div>
        </div>
      </main>

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="fixed bottom-0 w-full pb-8 text-center"
      >
        <span className="text-sm text-muted-foreground/60 font-medium">Cirrus</span>
      </motion.footer>
    </div>
  );
}
