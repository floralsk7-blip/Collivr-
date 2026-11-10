-- COLLIVRA profile fields used by the current frontend.
-- Safe to run more than once on an existing project.
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS branch text,
  ADD COLUMN IF NOT EXISTS skills_detailed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS project_interests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS open_to_collaborate boolean NOT NULL DEFAULT true;

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Ensure users can create/update only their own row; profiles are visible to signed-in users for discovery.
DROP POLICY IF EXISTS "Users can view student profiles" ON public.student_profiles;
CREATE POLICY "Users can view student profiles"
  ON public.student_profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.student_profiles;
CREATE POLICY "Users can insert their own profile"
  ON public.student_profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.student_profiles;
CREATE POLICY "Users can update their own profile"
  ON public.student_profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
