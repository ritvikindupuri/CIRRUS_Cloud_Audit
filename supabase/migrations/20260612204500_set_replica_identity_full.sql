-- Enable REPLICA IDENTITY FULL on core tables to allow Supabase Realtime to broadcast 
-- UPDATE and DELETE events when filtering by foreign keys (e.g. scan_id or agent_run_id).
ALTER TABLE public.scans REPLICA IDENTITY FULL;
ALTER TABLE public.agent_runs REPLICA IDENTITY FULL;
ALTER TABLE public.agent_steps REPLICA IDENTITY FULL;
ALTER TABLE public.findings REPLICA IDENTITY FULL;
