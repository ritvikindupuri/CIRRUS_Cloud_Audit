
ALTER TABLE public.agent_runs
  ADD COLUMN IF NOT EXISTS blocked_calls JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE public.remediation_deployments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  finding_id UUID NOT NULL REFERENCES public.findings(id) ON DELETE CASCADE,
  scan_id UUID NOT NULL REFERENCES public.scans(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  stack_name TEXT NOT NULL,
  stack_id TEXT,
  change_set_id TEXT,
  change_set_name TEXT,
  change_set_status TEXT,
  change_set_changes JSONB,
  template_yaml TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dry_run',
  executed BOOLEAN NOT NULL DEFAULT false,
  rolled_back BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  rolled_back_at TIMESTAMPTZ
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remediation_deployments TO authenticated;
GRANT ALL ON public.remediation_deployments TO service_role;

ALTER TABLE public.remediation_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own deployments"
  ON public.remediation_deployments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_remediation_deployments_finding ON public.remediation_deployments(finding_id);
CREATE INDEX idx_remediation_deployments_user ON public.remediation_deployments(user_id);
