-- Allow authors to edit only their own message body and edited timestamp.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

REVOKE UPDATE ON TABLE public.messages FROM anon, authenticated;
GRANT UPDATE (body, edited_at) ON TABLE public.messages TO authenticated;

DROP POLICY IF EXISTS "Authors edit their own messages" ON public.messages;
CREATE POLICY "Authors edit their own messages"
ON public.messages FOR UPDATE TO authenticated
USING (author_id = (SELECT auth.uid()))
WITH CHECK (author_id = (SELECT auth.uid()));

-- Either participant may remove an accepted friendship. Pending requests continue
-- to use the existing accept/decline/retry transition rules.
GRANT DELETE ON TABLE public.friendships TO authenticated;
DROP POLICY IF EXISTS "Participants remove accepted friendships" ON public.friendships;
CREATE POLICY "Participants remove accepted friendships"
ON public.friendships FOR DELETE TO authenticated
USING (
  status = 'accepted'
  AND (requester_id = (SELECT auth.uid()) OR addressee_id = (SELECT auth.uid()))
);
