-- Student Profiles
create table student_profiles (
  id uuid references auth.users primary key,
  name text not null,
  photo_url text,
  college text,
  year int,
  department text,
  skills text[],
  experience text,
  previous_projects text[],
  github_url text,
  linkedin_url text,
  cgpa float,
  created_at timestamp default now()
);

-- Projects
create table projects (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references student_profiles(id) on delete cascade,
  name text not null,
  description text,
  domain text,
  deadline date,
  team_size int,
  skills_required text[],
  experience_required text,
  status text default 'open',
  created_at timestamp default now()
);

-- AI Analysis Results
create table ai_analysis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  identified_roles text[],
  skill_gaps text[],
  sustainability_notes text,
  raw_response text,
  created_at timestamp default now()
);

-- Match Scores
create table match_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references student_profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  score_percent float,
  skill_overlap text[],
  notes text,
  created_at timestamp default now()
);

-- Team Invites
create table team_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  sender_id uuid references student_profiles(id),
  receiver_id uuid references student_profiles(id),
  status text default 'pending',
  created_at timestamp default now()
);

-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  overall_match_score float,
  coaching_notes text,
  created_at timestamp default now()
);

-- Team Members
create table team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  student_id uuid references student_profiles(id),
  role text,
  joined_at timestamp default now()
);

-- Tasks
create table tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid[],
  status text default 'todo',
  deadline date,
  created_at timestamp default now()
);

-- Messages (Team Chat)
create table messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  sender_id uuid references student_profiles(id),
  content text not null,
  created_at timestamp default now()
);

-- Enable Realtime on messages
alter publication supabase_realtime add table messages;

-- Row Level Security (enable on all tables)
alter table student_profiles enable row level security;
alter table projects enable row level security;
alter table ai_analysis enable row level security;
alter table match_scores enable row level security;
alter table team_invites enable row level security;
alter table teams enable row level security;
alter table team_members enable row level security;
alter table tasks enable row level security;
alter table messages enable row level security;

-- Basic RLS Policies (authenticated users can read/write their own data)
create policy "Users can view all profiles" on student_profiles for select using (true);
create policy "Users can update own profile" on student_profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on student_profiles for insert with check (auth.uid() = id);

create policy "Anyone can view open projects" on projects for select using (true);
create policy "Creator can insert project" on projects for insert with check (auth.uid() = creator_id);
create policy "Creator can update project" on projects for update using (auth.uid() = creator_id);

create policy "Team members can view messages" on messages for select using (true);
create policy "Authenticated users can send messages" on messages for insert with check (auth.uid() = sender_id);

create policy "Anyone can view tasks" on tasks for select using (true);
create policy "Team members can insert tasks" on tasks for insert with check (true);
create policy "Team members can update tasks" on tasks for update using (true);

-- Additional policies needed for the app to function end-to-end
create policy "Anyone can view ai_analysis" on ai_analysis for select using (true);
create policy "Anyone can view match_scores" on match_scores for select using (true);

create policy "Anyone can view invites" on team_invites for select using (true);
create policy "Sender can create invites" on team_invites for insert with check (auth.uid() = sender_id);
create policy "Receiver can update invite status" on team_invites for update using (auth.uid() = receiver_id or auth.uid() = sender_id);

create policy "Anyone can view teams" on teams for select using (true);
create policy "Project creator can create team" on teams for insert with check (
  exists (select 1 from projects where projects.id = project_id and projects.creator_id = auth.uid())
);

create policy "Anyone can view team_members" on team_members for select using (true);
create policy "Project creator can add members" on team_members for insert with check (true);

-- Storage bucket for profile photos
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "Avatar images are publicly accessible" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users can upload their own avatar" on storage.objects for insert with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Milestones
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  title text not null,
  due_date date,
  status text default 'upcoming',
  created_at timestamp with time zone default now()
);
alter table milestones enable row level security;
create policy "Anyone can view milestones" on milestones for select using (true);
create policy "Authenticated users can manage milestones" on milestones for all using (auth.uid() is not null);

-- Connections (Find People)
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references student_profiles(id) on delete cascade,
  receiver_id uuid references student_profiles(id) on delete cascade,
  status text default 'pending',
  created_at timestamp with time zone default now()
);
alter table connections enable row level security;
create policy "Anyone can view connections" on connections for select using (true);
create policy "Users can send connections" on connections for insert with check (auth.uid() = sender_id);
create policy "Receiver can update connection" on connections for update using (auth.uid() = receiver_id);

-- COLLIVRA rebrand additions: skill levels, profile extras, task priority, message reads
alter table student_profiles add column if not exists skills_detailed jsonb default '[]'::jsonb;
alter table student_profiles add column if not exists tagline text;
alter table student_profiles add column if not exists location text;
alter table student_profiles add column if not exists availability_hours text;
alter table student_profiles add column if not exists project_interests text[];
alter table student_profiles add column if not exists open_to_collaborate boolean default true;

alter table tasks add column if not exists priority text default 'Medium';

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

-- Branch rename, direct messages, and unique connection pairs
alter table student_profiles add column if not exists branch text;
update student_profiles set branch = department where branch is null and department is not null;

create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references student_profiles(id) on delete cascade,
  receiver_id uuid references student_profiles(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists dm_pair_idx on direct_messages (sender_id, receiver_id, created_at);
alter table direct_messages enable row level security;
create policy "users read own dms" on direct_messages for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
create policy "users send dms" on direct_messages for insert with check (auth.uid() = sender_id);
create policy "receiver marks read" on direct_messages for update using (auth.uid() = receiver_id);
alter publication supabase_realtime add table direct_messages;

create unique index if not exists connections_unique_pair
  on connections (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
