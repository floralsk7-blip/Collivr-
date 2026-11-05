-- Additive organiser profile fields. Existing student profile and payment data remain unchanged.
begin;
alter table public.student_profiles
  add column if not exists organisation_type text,
  add column if not exists designation text,
  add column if not exists website_url text,
  add column if not exists location text,
  add column if not exists organisation_about text,
  add column if not exists contact_phone text,
  add column if not exists organisation_logo_url text,
  add column if not exists organiser_verification_status text not null default 'pending';

alter table public.student_profiles
  drop constraint if exists student_profiles_organisation_type_check;
alter table public.student_profiles
  add constraint student_profiles_organisation_type_check
  check (organisation_type is null or organisation_type in ('company','college','ngo','community','individual'));

alter table public.student_profiles
  drop constraint if exists student_profiles_organiser_verification_status_check;
alter table public.student_profiles
  add constraint student_profiles_organiser_verification_status_check
  check (organiser_verification_status in ('pending','verified','rejected'));
commit;

notify pgrst, 'reload schema';
