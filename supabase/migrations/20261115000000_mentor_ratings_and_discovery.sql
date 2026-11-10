-- Collivra Smart Mentor Matching: Sub-phase 5
-- Additive rating, review count, and pricing fields for mentor matching and discovery.

begin;

alter table public.mentor_profiles
  add column if not exists average_rating numeric(3,2) check (average_rating is null or (average_rating >= 1.0 and average_rating <= 5.0)),
  add column if not exists review_count int not null default 0 check (review_count >= 0),
  add column if not exists hourly_rate_usd numeric(8,2) check (hourly_rate_usd is null or hourly_rate_usd >= 0);

comment on column public.mentor_profiles.average_rating is
  'Aggregated rating score from 1.00 to 5.00 based on verified student reviews.';
comment on column public.mentor_profiles.review_count is
  'Total count of verified mentee reviews.';
comment on column public.mentor_profiles.hourly_rate_usd is
  'Optional hourly mentoring rate in USD for future paid mentorship plans.';

create index if not exists idx_mentor_profiles_discovery
  on public.mentor_profiles (is_active, verification_status, primary_category);

commit;

notify pgrst, 'reload schema';

