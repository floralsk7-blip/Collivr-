-- COLLIVRA Profile Separation: Student and Event Organiser Profile Privacy
-- Ensures a Student account cannot view an Event Organiser's private profile.
-- Organisers can view and manage their own profile.
-- Public event discovery and student registration remain completely intact.

BEGIN;

DROP POLICY IF EXISTS "Users can view student profiles" ON public.student_profiles;

CREATE POLICY "Users can view student profiles"
  ON public.student_profiles
  FOR SELECT
  TO authenticated
  USING (
    -- User can always view their own profile (student or organiser)
    id = auth.uid()
    OR
    -- Other users may only view student profiles (never private organiser profiles)
    COALESCE(account_type, 'student') = 'student'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
