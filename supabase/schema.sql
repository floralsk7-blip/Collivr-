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
  mentor_preference text default 'none' check (mentor_preference in ('none', 'professor', 'industry', 'ai', 'both')),
  created_at timestamp default now()
);

-- AI Analysis Results
create table ai_analysis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  identified_roles text[],
  skill_gaps text[],
  sustainability_notes text,
  recommended_mentor_type text,
  mentor_focus_areas text[] default '{}',
  mentor_guidance_notes text,
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

-- ============================================================================
-- Collivra Smart Mentor Matching: Mentor Profiles Architecture (Sub-phase 4)
-- ============================================================================

create table if not exists mentor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  photo_url text,
  headline text,
  bio text,
  location text,
  contact_email text,
  contact_preferences jsonb not null default '{"email": true, "in_app": true}'::jsonb,
  primary_category text not null default 'industry_expert' check (primary_category in ('college_professor', 'industry_expert', 'both')),
  categories text[] not null default '{"industry_expert"}'::text[],
  institution_name text,
  department text,
  academic_designation text,
  company_name text,
  company_role text,
  years_of_experience int not null default 0 check (years_of_experience >= 0),
  certifications text[] not null default '{}'::text[],
  achievements text[] not null default '{}'::text[],
  is_active boolean not null default true,
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'pending', 'verified', 'rejected', 'suspended')),
  rejection_reason text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id),
  offered_tiers text[] not null default '{"basic"}'::text[],
  average_rating numeric(3,2),
  review_count int not null default 0,
  hourly_rate_usd numeric(8,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_expertise (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null unique references mentor_profiles(id) on delete cascade,
  technical_skills text[] not null default '{}'::text[],
  domain_expertise text[] not null default '{}'::text[],
  research_interests text[] not null default '{}'::text[],
  tech_stack text[] not null default '{}'::text[],
  industry_specializations text[] not null default '{}'::text[],
  mentorship_topics text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_qualifications (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  degree text not null,
  institution text not null,
  field_of_study text,
  graduation_year int,
  is_highest boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mentor_portfolio (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  title text not null,
  description text,
  technologies text[] not null default '{}'::text[],
  project_url text,
  achievements text,
  created_at timestamptz not null default now()
);

create table if not exists mentor_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null unique references mentor_profiles(id) on delete cascade,
  is_available boolean not null default true,
  weekly_hours int not null default 5 check (weekly_hours >= 0 and weekly_hours <= 168),
  timezone text not null default 'UTC',
  preferred_days text[] not null default '{"Monday","Tuesday","Wednesday","Thursday","Friday"}'::text[],
  preferred_time_slots text[] not null default '{"Evening (6 PM - 9 PM)"}'::text[],
  max_active_mentees int not null default 3 check (max_active_mentees >= 1 and max_active_mentees <= 50),
  current_active_mentees int not null default 0 check (current_active_mentees >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_verification_documents (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  document_type text not null check (document_type in ('institutional_id', 'faculty_id', 'employment_proof', 'degree_certificate', 'linkedin_verification', 'government_id', 'other')),
  document_url text not null,
  document_name text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sub-phase 6: Mentor Packages and Subscriptions
create table if not exists mentor_packages (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  tier text not null check (tier in ('basic', 'standard', 'premium', 'custom')),
  name text not null check (char_length(name) between 2 and 120),
  description text,
  price_usd numeric(8,2) not null check (price_usd >= 0),
  currency text not null default 'USD',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'project', 'one_time')),
  duration_weeks int not null default 4 check (duration_weeks between 1 and 52),
  sessions_count int not null default 1 check (sessions_count between 1 and 50),
  chat_support boolean not null default true,
  code_review boolean not null default false,
  project_review boolean not null default false,
  priority_support boolean not null default false,
  benefits text[] not null default '{}'::text[],
  limitations text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mentor_package_tier_unique unique (mentor_id, tier)
);

create table if not exists mentor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  package_id uuid not null references mentor_packages(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'active', 'paused', 'cancelled', 'expired')),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'project', 'one_time')),
  price_paid numeric(8,2) not null default 0 check (price_paid >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_subscription_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references mentor_subscriptions(id) on delete cascade,
  action text not null check (action in ('created', 'payment_verified', 'activated', 'renewed', 'paused', 'resumed', 'cancellation_requested', 'cancelled', 'expired')),
  from_status text,
  to_status text,
  notes text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Sub-phase 7: Mentor Bookings and Payments
create table if not exists mentor_bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  package_id uuid not null references mentor_packages(id) on delete restrict,
  project_id uuid references projects(id) on delete set null,
  subscription_id uuid references mentor_subscriptions(id) on delete set null,
  status text not null default 'pending_payment' check (
    status in (
      'pending_payment',
      'payment_verified',
      'awaiting_acceptance',
      'confirmed',
      'rejected',
      'cancelled',
      'completed',
      'refund_pending',
      'refunded'
    )
  ),
  session_scheduled_at timestamptz not null,
  session_duration_minutes int not null default 60 check (session_duration_minutes between 15 and 240),
  proposed_alternative_times text[] not null default '{}'::text[],
  meeting_link text,
  student_notes text,
  mentor_notes text,
  rejection_reason text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references mentor_bookings(id) on delete cascade,
  student_id uuid not null references auth.users(id),
  mentor_id uuid not null references mentor_profiles(id),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  amount numeric(8,2) not null check (amount >= 0),
  currency text not null default 'USD',
  status text not null check (status in ('created', 'captured', 'failed', 'refunded')),
  idempotency_key text unique,
  failure_reason text,
  refund_reason text,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sub-phase 8: Mentor Workspace, Milestones, and Reviews
create table if not exists mentor_workspace_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references mentor_bookings(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  category text not null default 'general' check (category in ('general', 'code_review', 'architecture', 'feedback', 'action_item')),
  content text not null check (char_length(content) between 2 and 5000),
  is_pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentorship_milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 200),
  description text,
  due_date date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'blocked')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mentor_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references mentor_bookings(id) on delete cascade,
  mentor_id uuid not null references mentor_profiles(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  rating numeric(2,1) not null check (rating >= 1.0 and rating <= 5.0),
  review_title text check (review_title is null or char_length(review_title) <= 120),
  review_text text not null check (char_length(review_text) between 5 and 2000),
  is_public boolean not null default true,
  created_at timestamptz not null default now()
);

-- PayPal Webhook Events Idempotency Audit Table
create table if not exists paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  event_type text not null,
  resource_id text,
  status text not null default 'processed',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table paypal_webhook_events enable row level security;

