import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CirrusLogo } from "@/components/cirrus-logo";
import { ArrowRight } from "lucide-react";
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
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <header className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/20">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <CirrusLogo size={32} />
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

      <main className="pt-32 pb-24 flex flex-col items-center justify-center min-h-screen text-center px-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="max-w-4xl mx-auto flex flex-col items-center"
        >
          <motion.div variants={itemVariants} className="mb-12">
            <CirrusLogo size={120} withWordmark={false} className="opacity-90 scale-110" />
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="text-6xl md:text-8xl font-medium tracking-tight text-foreground leading-[1.1] mb-6"
          >
            Security, <br className="hidden md:block" />
            <span className="text-muted-foreground">simplified.</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl font-light leading-relaxed mb-12"
          >
            Autonomous red-team agents that map and test your AWS environment flawlessly.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center gap-4"
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
        </motion.div>
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
