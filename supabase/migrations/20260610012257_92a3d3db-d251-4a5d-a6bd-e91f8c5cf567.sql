
-- Custom agents
CREATE TABLE public.custom_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  system_prompt text NOT NULL,
  services text[] NOT NULL DEFAULT '{}'::text[],
  color text NOT NULL DEFAULT '#a78bfa',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_agents TO authenticated;
GRANT ALL ON public.custom_agents TO service_role;
ALTER TABLE public.custom_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own custom agents" ON public.custom_agents
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Scheduled scans
CREATE TABLE public.scheduled_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  region text NOT NULL DEFAULT 'us-east-1',
  selected_agents text[] NOT NULL DEFAULT '{}'::text[],
  custom_agent_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  cadence_days integer NOT NULL DEFAULT 7,
  last_run_scan_id uuid,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_scans TO authenticated;
GRANT ALL ON public.scheduled_scans TO service_role;
ALTER TABLE public.scheduled_scans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled scans" ON public.scheduled_scans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Extend findings
ALTER TABLE public.findings ADD COLUMN IF NOT EXISTS remediation jsonb;

-- Extend scans
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS scheduled_scan_id uuid;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS parent_scan_id uuid;
ALTER TABLE public.scans ADD COLUMN IF NOT EXISTS custom_agent_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Extend agent_runs
ALTER TABLE public.agent_runs ADD COLUMN IF NOT EXISTS custom_agent_id uuid;
