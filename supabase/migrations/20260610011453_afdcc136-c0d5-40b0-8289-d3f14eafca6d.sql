
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only subscribe to their own scan channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() LIKE 'scan:%'
  AND EXISTS (
    SELECT 1 FROM public.scans s
    WHERE s.id::text = split_part(realtime.topic(), ':', 2)
      AND s.user_id = (SELECT auth.uid())
  )
);
