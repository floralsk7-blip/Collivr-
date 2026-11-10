-- Skill levels: store skills as JSONB so each skill carries a level
alter table student_profiles add column if not exists skills_detailed jsonb default '[]'::jsonb;
-- shape: [{"name":"Python","level":"Advanced"}, {"name":"React","level":"Beginner"}]

-- Profile extras shown on the profile screen
alter table student_profiles add column if not exists tagline text;
alter table student_profiles add column if not exists location text;
alter table student_profiles add column if not exists availability_hours text;
alter table student_profiles add column if not exists project_interests text[];
alter table student_profiles add column if not exists open_to_collaborate boolean default true;

-- Task priority (used by the Tasks list)
alter table tasks add column if not exists priority text default 'Medium';

-- Message read tracking (for the sidebar unread badge)
create table if not exists message_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references student_profiles(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  last_read_at timestamptz default now(),
  unique(user_id, team_id)
);
alter table message_reads enable row level security;
create policy "view reads" on message_reads for select using (true);
create policy "manage reads" on message_reads for all using (auth.uid() = user_id);
