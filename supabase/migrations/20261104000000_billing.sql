-- COLLIVRA plans and billing. Safe to run more than once.
-- Adds: subscriptions (PayPal), AI usage counting, plan inquiries, event size for pricing,
-- and fixes duplicate rows in match_scores / ai_analysis.

-- Event size drives the Event Pass price tier.
alter table public.events
  add column if not exists expected_participants int
  check (expected_participants between 1 and 5000);

-- ---------------------------------------------------------------------------
-- Subscriptions. Written ONLY by edge functions (service role) after PayPal verifies them.
-- ---------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  plan_key text not null,
  paypal_subscription_id text not null unique,
  status text not null,
  access_until timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists subscriptions_user_idx on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;
drop policy if exists "users read own subscriptions" on public.subscriptions;
create policy "users read own subscriptions"
  on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- AI usage (monthly limits per plan). Written only by edge functions.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_idx on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;
drop policy if exists "users read own ai usage" on public.ai_usage;
create policy "users read own ai usage"
  on public.ai_usage for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Quote requests for the Organizations / Startups (custom) plan.
-- ---------------------------------------------------------------------------
create table if not exists public.plan_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  org_name text not null check (char_length(org_name) between 2 and 120),
  org_type text,
  contact_email text not null check (char_length(contact_email) between 5 and 200),
  message text check (char_length(message) <= 1500),
  created_at timestamptz not null default now()
);

alter table public.plan_inquiries enable row level security;
drop policy if exists "users send own inquiries" on public.plan_inquiries;
create policy "users send own inquiries"
  on public.plan_inquiries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users read own inquiries" on public.plan_inquiries;
create policy "users read own inquiries"
  on public.plan_inquiries for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Bug fix: results were inserted again on every run. Keep the newest row, then enforce uniqueness.
-- ---------------------------------------------------------------------------
delete from public.match_scores a using public.match_scores b
  where a.project_id = b.project_id and a.student_id = b.student_id
    and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));
create unique index if not exists match_scores_project_student_uniq
  on public.match_scores (project_id, student_id);

delete from public.ai_analysis a using public.ai_analysis b
  where a.project_id = b.project_id
    and (a.created_at < b.created_at or (a.created_at = b.created_at and a.id < b.id));
create unique index if not exists ai_analysis_project_uniq on public.ai_analysis (project_id);

-- Leftover from the removed AI agent prototype (no-op if it never existed).
drop table if exists public.agent_actions;

-- ---------------------------------------------------------------------------
-- Cached AI results, so unchanged inputs never spend another AI action.
-- Written and read only by edge functions (no policies = no browser access).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null,
  input_hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create unique index if not exists ai_results_project_kind_uniq on public.ai_results (project_id, kind);
alter table public.ai_results enable row level security;
