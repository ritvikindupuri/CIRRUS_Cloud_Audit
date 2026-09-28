-- Rate limiting tracking table
CREATE TABLE public.rate_limit_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL, -- 'user:<uuid>' or 'ip:<address>'
  endpoint TEXT NOT NULL, -- '/api/scans/run', '/api/remediation/execute', etc.
  count INT NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key, endpoint, window_start)
);

-- Cleanup old rate limit entries (> 1 hour)
CREATE INDEX rate_limit_window_idx ON public.rate_limit_tracking(window_start);

-- RLS: service_role only (rate limiting is server-side)
GRANT ALL ON public.rate_limit_tracking TO service_role;
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role only" ON public.rate_limit_tracking FOR ALL USING (false);
