-- COLLIVRA workflow correction:
-- workspace creation is not blocked by verification/subscription;
-- event drafts are free to create; publication requires a captured Event Pass;
-- only student accounts may register, never the organiser or workspace staff.
begin;

alter table public.events
  add column if not exists event_pass_tier text not null default 'standard';
alter table public.events drop constraint if exists events_event_pass_tier_check;
alter table public.events add constraint events_event_pass_tier_check
  check (event_pass_tier in ('standard','advanced','complex'));


-- Replace the old workspace RPC: create the workspace and owner membership directly;
-- do not create a verification request or impose a pending-review workflow.
create or replace function public.create_organization_workspace(
  p_name text, p_type text, p_website text default null, p_official_email text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if p_type not in ('institution','organisation') or char_length(trim(p_name)) not between 2 and 160 then
    raise exception 'Invalid workspace details';
  end if;
  if not exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type=p_type) then
    raise exception 'Your account type does not match this workspace';
  end if;
  if exists(select 1 from public.organization_members m where m.user_id=auth.uid() and m.membership_status='active') then
    raise exception 'You already belong to an active workspace';
  end if;
  insert into public.organizations(name,organization_type,website,official_email,created_by,subscription_owner_user_id)
  values(trim(p_name),p_type,nullif(trim(p_website),''),nullif(trim(p_official_email),''),auth.uid(),
    case when p_type='institution' then auth.uid() else null end)
  returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role,membership_status)
  values(new_id,auth.uid(),'owner','active');
  return new_id;
end;
$$;
revoke all on function public.create_organization_workspace(text,text,text,text) from public;
grant execute on function public.create_organization_workspace(text,text,text,text) to authenticated;

-- Workspace managers can work without a separate verification queue. This does not
-- grant publication: the Event Pass payment remains a separate mandatory gate.
create or replace function public.is_org_manager(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id
    join public.student_profiles p on p.id=m.user_id
    where m.organization_id=p_org and m.user_id=p_user
      and m.membership_status='active'
      and m.role in ('owner','admin','event_manager')
      and p.account_type in ('organiser','institution','organisation')
  );
$$;

create or replace function public.can_create_collivra_event()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.student_profiles p
    where p.id=auth.uid() and p.account_type in ('organiser','institution','organisation'));
$$;

-- The two-argument signature is used by trusted Edge Functions. The one-argument
-- signature remains available to existing policies and frontend calls.
create or replace function public.can_manage_collivra_event(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.events e
    where e.id=p_event and e.organization_id is not null
      and public.is_org_manager(e.organization_id,p_user)
  );
$$;

create or replace function public.can_manage_collivra_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event,auth.uid());
$$;

create or replace function public.can_review_collivra_event(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event,p_user)
    or exists(
      select 1 from public.events e
      join public.organization_members m on m.organization_id=e.organization_id
      where e.id=p_event and m.user_id=p_user and m.role='judge'
        and m.membership_status='active'
    );
$$;

create or replace function public.can_create_event_for_workspace(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_org_manager(p_org,auth.uid());
$$;

-- Event creator may create a draft with no paid plan or verification. Only workspace
-- managers can do so, and the event must belong to their own workspace.
drop policy if exists "verified workspace creates draft event" on public.events;
drop policy if exists "organizer creates draft event" on public.events;
drop policy if exists "workspace managers create draft event" on public.events;
create policy "workspace managers create draft event" on public.events
  for insert to authenticated
  with check (
    organizer_id=auth.uid() and status='draft' and paid_at is null
    and organization_id is not null
    and public.can_create_collivra_event()
    and public.is_org_manager(organization_id,auth.uid())
  );

drop policy if exists "workspace managers edit own event" on public.events;
create policy "workspace managers edit own event" on public.events
  for update to authenticated
  using (public.can_manage_collivra_event(id,auth.uid()))
  with check (public.can_manage_collivra_event(id,auth.uid()));

drop policy if exists "workspace managers delete unpaid event" on public.events;
create policy "workspace managers delete unpaid event" on public.events
  for delete to authenticated
  using (public.can_manage_collivra_event(id,auth.uid()) and status in ('draft','pending_payment'));

-- Public event discovery only shows paid/published events; creators can see their drafts.
drop policy if exists "events readable by signed-in users" on public.events;
create policy "events readable by signed-in users" on public.events
  for select to authenticated
  using (status in ('published','teams_formed')
    or organizer_id=auth.uid()
    or public.can_manage_collivra_event(id,auth.uid()));

-- Students only. This excludes the event creator, all workspace staff, and any
-- institution/organisation account even if someone tries a direct API insert.
drop policy if exists "students join published events" on public.event_participants;
drop policy if exists "students join open events" on public.event_participants;
drop policy if exists "student accounts join paid published events" on public.event_participants;
create policy "student accounts join paid published events" on public.event_participants
  for insert to authenticated
  with check (
    student_id=auth.uid()
    and exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='student')
    and exists(select 1 from public.events e where e.id=event_id
      and e.status='published'
      and e.organizer_id<>auth.uid()
      and (e.registration_opens_at is null or e.registration_opens_at<=now())
      and (e.registration_deadline_at is null or e.registration_deadline_at>now()))
    and not exists(select 1 from public.events e join public.organization_members m
      on m.organization_id=e.organization_id
      where e.id=event_id and m.user_id=auth.uid() and m.membership_status='active')
  );

commit;
