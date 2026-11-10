-- COLLIVRA mentorship (a Premium feature). Safe to run more than once.
-- Anyone can opt in as a mentor. Premium / College members request mentors through the server,
-- which checks their plan. When a mentor accepts, the two become connections and can message.

alter table public.student_profiles
  add column if not exists is_mentor boolean not null default false,
  add column if not exists mentor_topics text[] not null default '{}',
  add column if not exists mentor_bio text;

create table if not exists public.mentorship_requests (
  id uuid primary key default gen_random_uuid(),
  mentee_id uuid not null references public.student_profiles(id) on delete cascade,
  mentor_id uuid not null references public.student_profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  message text check (char_length(message) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (mentee_id <> mentor_id)
);

-- One open request per mentor and mentee at a time.
create unique index if not exists mentorship_one_pending_uniq
  on public.mentorship_requests (mentee_id, mentor_id) where status = 'pending';
create index if not exists mentorship_mentor_idx on public.mentorship_requests (mentor_id, status);
create index if not exists mentorship_mentee_idx on public.mentorship_requests (mentee_id, status);

alter table public.mentorship_requests enable row level security;
drop policy if exists "parties read mentorship requests" on public.mentorship_requests;
create policy "parties read mentorship requests"
  on public.mentorship_requests for select to authenticated
  using (mentee_id = auth.uid() or mentor_id = auth.uid());
-- No insert/update/delete policies: only edge functions write, after checking the plan.
