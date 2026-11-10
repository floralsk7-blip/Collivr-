BEGIN;

DROP POLICY IF EXISTS
  "published events and own drafts readable"
ON public.events;

CREATE POLICY
  "students discover published events and organisers see own events"
ON public.events
FOR SELECT
TO authenticated
USING (
  organizer_id = auth.uid()
  OR (
    status IN ('published', 'teams_formed')
    AND NOT EXISTS (
      SELECT 1
      FROM public.student_profiles
      WHERE id = auth.uid()
        AND account_type = 'organiser'
    )
  )
);

COMMIT;
