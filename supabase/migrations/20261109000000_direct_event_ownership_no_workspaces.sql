-- COLLIVRA event-first model: no workspace/team/staff dependency.
-- Event ownership is the organiser account that created the event. Existing
-- organization rows, memberships, events and payment history are retained;
-- organization_id becomes legacy/optional metadata and is not used for access.
begin;

alter table public.events alter column organization_id drop not null;
create or replace function public.can_create_collivra_event()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.student_profiles p
    where p.id=auth.uid() and p.account_type='organiser'
  );
$$;

create or replace function public.can_manage_collivra_event(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.events e
    join public.student_profiles p on p.id=e.organizer_id
    where e.id=p_event and e.organizer_id=p_user and p.account_type='organiser'
  );
$$;

create or replace function public.can_manage_collivra_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event,auth.uid());
$$;

create or replace function public.can_review_collivra_event(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event,p_user);
$$;

create or replace function public.can_create_event_for_workspace(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_create_collivra_event();
$$;

-- Event creator owns the event. No organization membership is required.
drop policy if exists "workspace managers create draft event" on public.events;
drop policy if exists "organizer creates draft event" on public.events;
drop policy if exists "verified workspace creates draft event" on public.events;
drop policy if exists "organiser creates own draft event" on public.events;
create policy "organiser creates own draft event" on public.events
  for insert to authenticated
  with check (
    organizer_id=auth.uid() and status='draft' and paid_at is null
    and organization_id is null and public.can_create_collivra_event()
  );

drop policy if exists "workspace managers edit own event" on public.events;
drop policy if exists "organizer edits own event" on public.events;
drop policy if exists "event creator edits own event" on public.events;
create policy "event creator edits own event" on public.events
  for update to authenticated
  using (organizer_id=auth.uid() and public.can_create_collivra_event())
  with check (organizer_id=auth.uid() and public.can_create_collivra_event());

drop policy if exists "workspace managers delete unpaid event" on public.events;
drop policy if exists "organizer deletes own unpaid event" on public.events;
drop policy if exists "event creator deletes unpaid event" on public.events;
create policy "event creator deletes unpaid event" on public.events
  for delete to authenticated
  using (organizer_id=auth.uid() and status in ('draft','pending_payment') and paid_at is null);

drop policy if exists "events readable by signed-in users" on public.events;
drop policy if exists "published events and own drafts readable" on public.events;
create policy "published events and own drafts readable" on public.events
  for select to authenticated
  using (status in ('published','teams_formed') or organizer_id=auth.uid());


drop policy if exists "event creator removes participants" on public.event_participants;
create policy "event creator removes participants" on public.event_participants
  for delete to authenticated
  using (exists(select 1 from public.events e where e.id=event_id and e.organizer_id=auth.uid()));

-- Preserve the student-only registration boundary and enforce schedule + published status.
drop policy if exists "students join published events" on public.event_participants;
drop policy if exists "students join open events" on public.event_participants;
drop policy if exists "student accounts join paid published events" on public.event_participants;
drop policy if exists "students join published events only" on public.event_participants;
create policy "students join published events only" on public.event_participants
  for insert to authenticated
  with check (
    student_id=auth.uid()
    and exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='student')
    and exists(select 1 from public.events e where e.id=event_id
      and e.status='published' and e.organizer_id<>auth.uid()
      and (e.registration_opens_at is null or e.registration_opens_at<=now())
      and (e.registration_deadline_at is null or e.registration_deadline_at>now()))
  );

commit;
