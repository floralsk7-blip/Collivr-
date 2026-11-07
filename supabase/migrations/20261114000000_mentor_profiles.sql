-- Collivra Smart Mentor Matching: Sub-phase 4
-- Comprehensive normalized mentor profiles, expertise, qualifications, portfolio, availability, and verification.

begin;

-- 1. Helper trigger function for updated_at timestamps
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- 2. Core Mentor Profiles table
create table if not exists public.mentor_profiles (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_profiles_user on public.mentor_profiles(user_id);
create index if not exists idx_mentor_profiles_status on public.mentor_profiles(verification_status, is_active);
create index if not exists idx_mentor_profiles_category on public.mentor_profiles(primary_category);

-- 3. Verification status tampering protection trigger
create or replace function public.protect_mentor_verification_status()
returns trigger as $$
begin
  if (old.verification_status is distinct from new.verification_status
      or old.verified_at is distinct from new.verified_at
      or old.verified_by is distinct from new.verified_by
      or old.rejection_reason is distinct from new.rejection_reason) then
    -- Allow service role or admins full control
    if (auth.jwt() ->> 'role' <> 'service_role' and not coalesce((auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean, false)) then
      -- Legitimate transition: unverified or rejected -> pending (submission for review)
      if (new.verification_status = 'pending' and old.verification_status in ('unverified', 'rejected')) then
        new.verified_at := null;
        new.verified_by := null;
        new.rejection_reason := null;
      else
        -- Disallow self-verifying; revert to old verification values
        new.verification_status := old.verification_status;
        new.verified_at := old.verified_at;
        new.verified_by := old.verified_by;
        new.rejection_reason := old.rejection_reason;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tr_protect_mentor_verification_status on public.mentor_profiles;
create trigger tr_protect_mentor_verification_status
  before update on public.mentor_profiles
  for each row execute function public.protect_mentor_verification_status();

drop trigger if exists tr_mentor_profiles_updated_at on public.mentor_profiles;
create trigger tr_mentor_profiles_updated_at
  before update on public.mentor_profiles
  for each row execute function public.set_updated_at();

-- 4. Mentor Expertise Table
create table if not exists public.mentor_expertise (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null unique references public.mentor_profiles(id) on delete cascade,
  technical_skills text[] not null default '{}'::text[],
  domain_expertise text[] not null default '{}'::text[],
  research_interests text[] not null default '{}'::text[],
  tech_stack text[] not null default '{}'::text[],
  industry_specializations text[] not null default '{}'::text[],
  mentorship_topics text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_expertise_mentor on public.mentor_expertise(mentor_id);

drop trigger if exists tr_mentor_expertise_updated_at on public.mentor_expertise;
create trigger tr_mentor_expertise_updated_at
  before update on public.mentor_expertise
  for each row execute function public.set_updated_at();

-- 5. Mentor Qualifications Table
create table if not exists public.mentor_qualifications (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  degree text not null,
  institution text not null,
  field_of_study text,
  graduation_year int,
  is_highest boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_mentor_qualifications_mentor on public.mentor_qualifications(mentor_id);

-- 6. Mentor Portfolio Projects Table
create table if not exists public.mentor_portfolio (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  title text not null,
  description text,
  technologies text[] not null default '{}'::text[],
  project_url text,
  achievements text,
  created_at timestamptz not null default now()
);

create index if not exists idx_mentor_portfolio_mentor on public.mentor_portfolio(mentor_id);

-- 7. Mentor Availability Table
create table if not exists public.mentor_availability (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null unique references public.mentor_profiles(id) on delete cascade,
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

create index if not exists idx_mentor_availability_mentor on public.mentor_availability(mentor_id);

drop trigger if exists tr_mentor_availability_updated_at on public.mentor_availability;
create trigger tr_mentor_availability_updated_at
  before update on public.mentor_availability
  for each row execute function public.set_updated_at();

-- 8. Mentor Verification Documents (Private & Restricted)
create table if not exists public.mentor_verification_documents (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
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

create index if not exists idx_mentor_verification_mentor on public.mentor_verification_documents(mentor_id);

drop trigger if exists tr_mentor_verification_updated_at on public.mentor_verification_documents;
create trigger tr_mentor_verification_updated_at
  before update on public.mentor_verification_documents
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.mentor_profiles enable row level security;
alter table public.mentor_expertise enable row level security;
alter table public.mentor_qualifications enable row level security;
alter table public.mentor_portfolio enable row level security;
alter table public.mentor_availability enable row level security;
alter table public.mentor_verification_documents enable row level security;

-- A. mentor_profiles RLS
drop policy if exists "Public can view active mentor profiles" on public.mentor_profiles;
create policy "Public can view active mentor profiles"
  on public.mentor_profiles for select to authenticated
  using (is_active = true or user_id = auth.uid());

drop policy if exists "Mentors can insert their own profile" on public.mentor_profiles;
create policy "Mentors can insert their own profile"
  on public.mentor_profiles for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Mentors can update own profile" on public.mentor_profiles;
create policy "Mentors can update own profile"
  on public.mentor_profiles for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Mentors can delete own profile" on public.mentor_profiles;
create policy "Mentors can delete own profile"
  on public.mentor_profiles for delete to authenticated
  using (user_id = auth.uid());

-- B. mentor_expertise RLS
drop policy if exists "Public can view mentor expertise" on public.mentor_expertise;
create policy "Public can view mentor expertise"
  on public.mentor_expertise for select to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and (m.is_active = true or m.user_id = auth.uid())));

drop policy if exists "Mentors can manage own expertise" on public.mentor_expertise;
create policy "Mentors can manage own expertise"
  on public.mentor_expertise for all to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

-- C. mentor_qualifications RLS
drop policy if exists "Public can view mentor qualifications" on public.mentor_qualifications;
create policy "Public can view mentor qualifications"
  on public.mentor_qualifications for select to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and (m.is_active = true or m.user_id = auth.uid())));

drop policy if exists "Mentors can manage own qualifications" on public.mentor_qualifications;
create policy "Mentors can manage own qualifications"
  on public.mentor_qualifications for all to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

-- D. mentor_portfolio RLS
drop policy if exists "Public can view mentor portfolio" on public.mentor_portfolio;
create policy "Public can view mentor portfolio"
  on public.mentor_portfolio for select to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and (m.is_active = true or m.user_id = auth.uid())));

drop policy if exists "Mentors can manage own portfolio" on public.mentor_portfolio;
create policy "Mentors can manage own portfolio"
  on public.mentor_portfolio for all to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

-- E. mentor_availability RLS
drop policy if exists "Public can view mentor availability" on public.mentor_availability;
create policy "Public can view mentor availability"
  on public.mentor_availability for select to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and (m.is_active = true or m.user_id = auth.uid())));

drop policy if exists "Mentors can manage own availability" on public.mentor_availability;
create policy "Mentors can manage own availability"
  on public.mentor_availability for all to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

-- F. mentor_verification_documents RLS (PRIVATE & SECURE)
-- Never public. Only the mentor who uploaded the document, or an administrator/service_role can view.
drop policy if exists "Mentors can view own verification documents" on public.mentor_verification_documents;
create policy "Mentors can view own verification documents"
  on public.mentor_verification_documents for select to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

drop policy if exists "Mentors can insert own verification documents" on public.mentor_verification_documents;
create policy "Mentors can insert own verification documents"
  on public.mentor_verification_documents for insert to authenticated
  with check (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

drop policy if exists "Mentors can delete own verification documents" on public.mentor_verification_documents;
create policy "Mentors can delete own verification documents"
  on public.mentor_verification_documents for delete to authenticated
  using (exists (select 1 from public.mentor_profiles m where m.id = mentor_id and m.user_id = auth.uid()));

commit;

notify pgrst, 'reload schema';

