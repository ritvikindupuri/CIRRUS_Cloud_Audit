ALTER TABLE public.scheduled_scans
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ;
