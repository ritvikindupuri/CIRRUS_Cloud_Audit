-- Append-only audit log for privileged actions
-- Tracks all security-critical operations (CloudFormation, custom agent creation, credential bootstrap)
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL, -- 'cfn_create_changeset', 'cfn_execute', 'cfn_rollback', 'agent_bootstrap', 'custom_agent_create', 'scan_run'
  resource_type TEXT, -- 'deployment', 'agent', 'scan'
  resource_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for user and time-based queries
CREATE INDEX audit_log_user_created_idx ON public.audit_log(user_id, created_at DESC);
CREATE INDEX audit_log_action_idx ON public.audit_log(action);

-- RLS: users can only read their own audit logs
GRANT SELECT ON public.audit_log TO authenticated;
GRANT INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit log read" ON public.audit_log FOR SELECT USING (auth.uid() = user_id);
-- INSERT via service_role only (server-side logging)
CREATE POLICY "service_role insert" ON public.audit_log FOR INSERT WITH CHECK (false);
