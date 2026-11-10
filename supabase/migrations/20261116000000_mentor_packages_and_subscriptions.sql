-- Collivra Smart Mentor Matching: Sub-phase 6
-- Mentor Packages and Subscriptions Data Architecture
-- Distinct and completely isolated from Collivra platform Student Premium billing.

begin;

-- 1. Mentor Packages Table
create table if not exists public.mentor_packages (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
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

create index if not exists idx_mentor_packages_mentor on public.mentor_packages(mentor_id);
create index if not exists idx_mentor_packages_active on public.mentor_packages(is_active, tier);

drop trigger if exists tr_mentor_packages_updated_at on public.mentor_packages;
create trigger tr_mentor_packages_updated_at
  before update on public.mentor_packages
  for each row execute function public.set_updated_at();

-- 2. Mentor Subscriptions Table
create table if not exists public.mentor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  package_id uuid not null references public.mentor_packages(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
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

create index if not exists idx_mentor_subscriptions_student on public.mentor_subscriptions(student_id);
create index if not exists idx_mentor_subscriptions_mentor on public.mentor_subscriptions(mentor_id);
create index if not exists idx_mentor_subscriptions_project on public.mentor_subscriptions(project_id);
create index if not exists idx_mentor_subscriptions_status on public.mentor_subscriptions(status);

drop trigger if exists tr_mentor_subscriptions_updated_at on public.mentor_subscriptions;
create trigger tr_mentor_subscriptions_updated_at
  before update on public.mentor_subscriptions
  for each row execute function public.set_updated_at();

-- 3. Mentor Subscription History (Audit Trail)
create table if not exists public.mentor_subscription_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.mentor_subscriptions(id) on delete cascade,
  action text not null check (action in ('created', 'payment_verified', 'activated', 'renewed', 'paused', 'resumed', 'cancellation_requested', 'cancelled', 'expired')),
  from_status text,
  to_status text,
  notes text,
  performed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_mentor_sub_history_sub on public.mentor_subscription_history(subscription_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.mentor_packages enable row level security;
alter table public.mentor_subscriptions enable row level security;
alter table public.mentor_subscription_history enable row level security;

-- Mentor Packages RLS
drop policy if exists "Public can view active mentor packages" on public.mentor_packages;
create policy "Public can view active mentor packages"
  on public.mentor_packages for select to authenticated
  using (
    is_active = true
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Mentors can manage own packages" on public.mentor_packages;
create policy "Mentors can manage own packages"
  on public.mentor_packages for all to authenticated
  using (
    exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

-- Mentor Subscriptions RLS
drop policy if exists "Students can view own mentor subscriptions" on public.mentor_subscriptions;
create policy "Students can view own mentor subscriptions"
  on public.mentor_subscriptions for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "Mentors can view subscriptions for their services" on public.mentor_subscriptions;
create policy "Mentors can view subscriptions for their services"
  on public.mentor_subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Students can create initial subscription requests" on public.mentor_subscriptions;
create policy "Students can create initial subscription requests"
  on public.mentor_subscriptions for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending_payment');

drop policy if exists "Students can request cancellation for own subscriptions" on public.mentor_subscriptions;
create policy "Students can request cancellation for own subscriptions"
  on public.mentor_subscriptions for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

-- Mentor Subscription History RLS
drop policy if exists "Parties can view subscription history" on public.mentor_subscription_history;
create policy "Parties can view subscription history"
  on public.mentor_subscription_history for select to authenticated
  using (
    exists (
      select 1 from public.mentor_subscriptions s
      where s.id = subscription_id
        and (
          s.student_id = auth.uid()
          or exists (
            select 1 from public.mentor_profiles m
            where m.id = s.mentor_id and m.user_id = auth.uid()
          )
        )
    )
  );

commit;

notify pgrst, 'reload schema';

