ALTER TABLE public.remediation_deployments
  ADD COLUMN IF NOT EXISTS cfn_events JSONB NOT NULL DEFAULT '[]'::jsonb;
