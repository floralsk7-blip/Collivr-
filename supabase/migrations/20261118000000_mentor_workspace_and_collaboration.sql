-- Collivra Smart Mentor Matching: Sub-phase 8
-- Mentor Dashboard, Mentorship Workspace, Milestones, and Reviews Architecture

begin;

-- 1. Mentor Workspace Notes (Collaboration, Feedback, Code Reviews)
create table if not exists public.mentor_workspace_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.mentor_bookings(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  category text not null default 'general' check (category in ('general', 'code_review', 'architecture', 'feedback', 'action_item')),
  content text not null check (char_length(content) between 2 and 5000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_workspace_notes_project on public.mentor_workspace_notes(project_id);
create index if not exists idx_workspace_notes_mentor on public.mentor_workspace_notes(mentor_id);
create index if not exists idx_workspace_notes_student on public.mentor_workspace_notes(student_id);

drop trigger if exists tr_workspace_notes_updated_at on public.mentor_workspace_notes;
create trigger tr_workspace_notes_updated_at
  before update on public.mentor_workspace_notes
  for each row execute function public.set_updated_at();

-- 2. Mentorship Milestones Table
create table if not exists public.mentorship_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentorship_milestones_project on public.mentorship_milestones(project_id);
create index if not exists idx_mentorship_milestones_status on public.mentorship_milestones(status);

drop trigger if exists tr_mentorship_milestones_updated_at on public.mentorship_milestones;
create trigger tr_mentorship_milestones_updated_at
  before update on public.mentorship_milestones
  for each row execute function public.set_updated_at();

-- 3. Mentor Reviews and Feedback Table
create table if not exists public.mentor_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.mentor_bookings(id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  rating numeric(2,1) not null check (rating >= 1.0 and rating <= 5.0),
  review_title text check (review_title is null or char_length(review_title) <= 120),
  review_text text not null check (char_length(review_text) between 5 and 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_mentor_reviews_mentor on public.mentor_reviews(mentor_id);
create index if not exists idx_mentor_reviews_student on public.mentor_reviews(student_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.mentor_workspace_notes enable row level security;
alter table public.mentorship_milestones enable row level security;
alter table public.mentor_reviews enable row level security;

-- Workspace Notes RLS (Strictly restricted to involved parties)
drop policy if exists "Parties can read workspace notes" on public.mentor_workspace_notes;
create policy "Parties can read workspace notes"
  on public.mentor_workspace_notes for select to authenticated
  using (
    student_id = auth.uid()
    or author_id = auth.uid()
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Parties can write workspace notes" on public.mentor_workspace_notes;
create policy "Parties can write workspace notes"
  on public.mentor_workspace_notes for insert to authenticated
  with check (
    student_id = auth.uid()
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

-- Mentorship Milestones RLS
drop policy if exists "Parties can manage milestones" on public.mentorship_milestones;
create policy "Parties can manage milestones"
  on public.mentorship_milestones for all to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  )
  with check (
    student_id = auth.uid()
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

-- Mentor Reviews RLS
drop policy if exists "Public can read approved mentor reviews" on public.mentor_reviews;
create policy "Public can read approved mentor reviews"
  on public.mentor_reviews for select to authenticated
  using (is_public = true or student_id = auth.uid());

drop policy if exists "Students can insert review for completed booking" on public.mentor_reviews;
create policy "Students can insert review for completed booking"
  on public.mentor_reviews for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.mentor_bookings b
      where b.id = booking_id and b.student_id = auth.uid() and b.status = 'completed'
    )
  );

commit;

notify pgrst, 'reload schema';

