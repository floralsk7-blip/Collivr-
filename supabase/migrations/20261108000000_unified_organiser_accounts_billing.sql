-- COLLIVRA: unify Institution and Organisation logins into Student / Event Organiser.
-- Keep organization_type as the workspace category and retain all historical subscription rows.
begin;

-- Replace any prior account_type CHECK with the new two-value contract.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.student_profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%account_type%'
  loop
    execute format('alter table public.student_profiles drop constraint %I', c.conname);
  end loop;
end $$;

update public.student_profiles
set account_type = 'organiser'
where account_type in ('institution','organisation');

alter table public.student_profiles
  alter column account_type set default 'student',
  add constraint student_profiles_account_type_unified_check
    check (account_type in ('student','organiser'));

-- One organiser can own either workspace category. Existing organization rows and memberships remain intact.
create or replace function public.create_organization_workspace(
  p_name text, p_type text, p_website text default null, p_official_email text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_type not in ('institution','organisation') or char_length(trim(p_name)) not between 2 and 160 then
    raise exception 'Choose College / University or Company / Organisation and enter a valid workspace name';
  end if;
  if not exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='organiser') then
    raise exception 'Only Event Organiser accounts can create workspaces';
  end if;
  if exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.membership_status='active') then
    raise exception 'You already belong to an active workspace';
  end if;
  insert into public.organizations(name,organization_type,website,official_email,created_by,subscription_owner_user_id)
  values(trim(p_name),p_type,nullif(trim(p_website),''),nullif(trim(p_official_email),''),auth.uid(),auth.uid())
  returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role,membership_status)
  values(new_id,auth.uid(),'owner','active');
  return new_id;
end;
$$;
revoke all on function public.create_organization_workspace(text,text,text,text) from public;
grant execute on function public.create_organization_workspace(text,text,text,text) to authenticated;

create or replace function public.is_org_manager(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organization_members m
    join public.student_profiles p on p.id=m.user_id
    where m.organization_id=p_org and m.user_id=p_user
      and m.membership_status='active'
      and m.role in ('owner','admin','event_manager')
      and p.account_type='organiser'
  );
$$;

create or replace function public.can_create_collivra_event()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.student_profiles p
    where p.id=auth.uid() and p.account_type='organiser');
$$;

-- Workspace members who are organisers can manage regardless of whether their workspace is a college or company.
create or replace function public.can_manage_collivra_event(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.events e
    where e.id=p_event and e.organization_id is not null
      and public.is_org_manager(e.organization_id,p_user)
  );
$$;

-- Update the remaining legacy policies/helpers that compared account_type to workspace category.
create or replace function public.can_manage_collivra_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event,auth.uid());
$$;

create or replace function public.can_create_collivra_event()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='organiser');
$$;

drop policy if exists "users create org workspaces" on public.organizations;
create policy "users create org workspaces" on public.organizations for insert to authenticated
  with check (created_by=auth.uid() and exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='organiser'));

-- Event creator/workspace membership is checked independently of workspace category.
-- Keep student-only event registration policies unchanged.

-- New unified subscription plans are $19/$190. Existing legacy plan keys remain in the catalogue
-- and subscription rows are deliberately not rewritten or deleted.
commit;
