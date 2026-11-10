BEGIN;

CREATE TABLE IF NOT EXISTS public.project_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES public.student_profiles(id) ON DELETE CASCADE,
  message text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_join_requests_one_per_student UNIQUE (project_id, requester_id)
);

CREATE INDEX IF NOT EXISTS project_join_requests_project_status_idx
  ON public.project_join_requests (project_id, status, created_at DESC);

ALTER TABLE public.project_join_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Requesters and project creators can view join requests"
  ON public.project_join_requests;
CREATE POLICY "Requesters and project creators can view join requests"
  ON public.project_join_requests
  FOR SELECT
  TO authenticated
  USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Students can request to join open projects"
  ON public.project_join_requests;
CREATE POLICY "Students can request to join open projects"
  ON public.project_join_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM public.student_profiles sp
      WHERE sp.id = auth.uid()
        AND sp.account_type = 'student'
    )
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_id
        AND p.creator_id <> auth.uid()
        AND p.status IN ('open', 'forming')
        AND (p.deadline IS NULL OR p.deadline >= CURRENT_DATE)
    )
  );

DROP POLICY IF EXISTS "Requesters and creators can update join requests"
  ON public.project_join_requests;
CREATE POLICY "Requesters and creators can update join requests"
  ON public.project_join_requests
  FOR UPDATE
  TO authenticated
  USING (
    (
      requester_id = auth.uid()
      AND status IN ('pending', 'declined', 'withdrawn')
    )
    OR (
      status = 'pending'
      AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_id
          AND p.creator_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    (
      requester_id = auth.uid()
      AND status IN ('pending', 'withdrawn')
      AND EXISTS (
        SELECT 1
        FROM public.student_profiles sp
        WHERE sp.id = auth.uid()
          AND sp.account_type = 'student'
      )
      AND (
        status = 'withdrawn'
        OR EXISTS (
          SELECT 1
          FROM public.projects p
          WHERE p.id = project_id
            AND p.creator_id <> auth.uid()
            AND p.status IN ('open', 'forming')
            AND (p.deadline IS NULL OR p.deadline >= CURRENT_DATE)
        )
      )
    )
    OR (
      status IN ('accepted', 'declined')
      AND EXISTS (
        SELECT 1
        FROM public.projects p
        WHERE p.id = project_id
          AND p.creator_id = auth.uid()
      )
    )
  );

-- Keep the row identity stable and refresh updated_at on every permitted update.
CREATE OR REPLACE FUNCTION public.guard_project_join_request_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Project join request identity fields cannot be changed';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_project_join_request_update_trg
  ON public.project_join_requests;
CREATE TRIGGER guard_project_join_request_update_trg
  BEFORE UPDATE ON public.project_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_project_join_request_update();

-- When the project creator accepts an application, mirror it as an accepted
-- team_invites row. The existing Team Formation screen already consumes those
-- accepted invitations when finalising the team.
CREATE OR REPLACE FUNCTION public.sync_accepted_project_join_request_to_team_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id uuid;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT p.creator_id
      INTO v_creator_id
    FROM public.projects p
    WHERE p.id = NEW.project_id;

    IF v_creator_id IS NULL THEN
      RAISE EXCEPTION 'Project creator could not be found';
    END IF;

    UPDATE public.team_invites ti
       SET status = 'accepted'
     WHERE ti.project_id = NEW.project_id
       AND ti.sender_id = v_creator_id
       AND ti.receiver_id = NEW.requester_id
       AND ti.status = 'pending';

    IF NOT FOUND AND NOT EXISTS (
      SELECT 1
      FROM public.team_invites ti
      WHERE ti.project_id = NEW.project_id
        AND ti.sender_id = v_creator_id
        AND ti.receiver_id = NEW.requester_id
        AND ti.status = 'accepted'
    ) THEN
      INSERT INTO public.team_invites (project_id, sender_id, receiver_id, status)
      VALUES (NEW.project_id, v_creator_id, NEW.requester_id, 'accepted');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_accepted_project_join_request_to_team_invite_trg
  ON public.project_join_requests;
CREATE TRIGGER sync_accepted_project_join_request_to_team_invite_trg
  AFTER UPDATE OF status ON public.project_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_accepted_project_join_request_to_team_invite();

COMMIT;
