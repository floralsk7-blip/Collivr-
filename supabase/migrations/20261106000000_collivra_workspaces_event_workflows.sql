-- COLLIVRA V3: verified workspaces, organisation-owned entitlements and event workflow engine.
-- Additive migration. It does not alter PayPal order/subscription functions or payment tables.
begin;

alter table public.student_profiles
  add column if not exists account_type text not null default 'student'
    check (account_type in ('student','institution','organisation')),
  add column if not exists organisation_name text,
  add column if not exists official_email text;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  organization_type text not null check (organization_type in ('institution','organisation')),
  website text,
  official_email text,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','rejected')),
  subscription_status text not null default 'inactive'
    check (subscription_status in ('inactive','active','suspended','expired')),
  subscription_plan text,
  subscription_owner_user_id uuid references public.student_profiles(id) on delete set null,
  contract_access_until timestamptz,
  event_limit integer check (event_limit is null or event_limit between 1 and 10000),
  created_by uuid not null references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  role text not null default 'event_manager'
    check (role in ('owner','admin','event_manager','judge','mentor')),
  membership_status text not null default 'active'
    check (membership_status in ('invited','active','suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id,user_id)
);

create table if not exists public.organization_verification_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submitted_by uuid not null references public.student_profiles(id),
  evidence_url text,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.student_profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);


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
  insert into public.organizations(name,organization_type,website,official_email,created_by,subscription_owner_user_id)
  values(trim(p_name),p_type,nullif(trim(p_website),''),nullif(trim(p_official_email),''),auth.uid(),
    case when p_type='institution' then auth.uid() else null end)
  returning id into new_id;
  insert into public.organization_members(organization_id,user_id,role,membership_status)
  values(new_id,auth.uid(),'owner','active');
  insert into public.organization_verification_requests(organization_id,submitted_by,evidence_url,notes)
  values(new_id,auth.uid(),nullif(trim(p_website),''),'Initial workspace verification request. Official contact: ' || coalesce(nullif(trim(p_official_email),''),'not supplied'));
  return new_id;
end;
$$;
revoke all on function public.create_organization_workspace(text,text,text,text) from public;
grant execute on function public.create_organization_workspace(text,text,text,text) to authenticated;

alter table public.events
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists contract_included boolean not null default false,
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_deadline_at timestamptz,
  add column if not exists registration_reminder_sent_at timestamptz;
alter table public.plan_inquiries
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists status text not null default 'pending'
    check (status in ('pending','contacted','approved','rejected'));


create or replace function public.guard_event_columns()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status is distinct from old.status
       or new.paid_at is distinct from old.paid_at
       or new.organizer_id is distinct from old.organizer_id
       or new.organization_id is distinct from old.organization_id
       or new.contract_included is distinct from old.contract_included then
      raise exception 'Event status, payment and workspace entitlement fields can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_organization_entitlement()
returns trigger language plpgsql set search_path=public as $$
begin
  if tg_op='INSERT' then
    if coalesce(auth.role(),'') <> 'service_role' then
      if new.verification_status <> 'pending' or new.subscription_status <> 'inactive'
         or new.subscription_plan is not null or new.contract_access_until is not null or new.event_limit is not null then
        raise exception 'Workspace verification and paid entitlements are controlled by COLLIVRA';
      end if;
    end if;
  elsif coalesce(auth.role(),'') <> 'service_role' then
    if new.verification_status is distinct from old.verification_status
       or new.subscription_status is distinct from old.subscription_status
       or new.subscription_plan is distinct from old.subscription_plan
       or new.subscription_owner_user_id is distinct from old.subscription_owner_user_id
       or new.contract_access_until is distinct from old.contract_access_until
       or new.event_limit is distinct from old.event_limit then
      raise exception 'Workspace verification and paid entitlements are controlled by COLLIVRA';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_organization_entitlement_trg on public.organizations;
create trigger guard_organization_entitlement_trg before insert or update on public.organizations
for each row execute function public.guard_organization_entitlement();

create or replace function public.has_active_student_plan(p_user uuid, p_plan text default null)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id=p_user
      and (p_plan is null or s.plan_key=p_plan)
      and (s.status='ACTIVE' or (s.status='CANCELLED' and s.access_until > now()))
  );
$$;

create or replace function public.set_event_contract_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
declare org public.organizations%rowtype;
declare used integer;
begin
  new.contract_included := false;
  if new.organization_id is null then return new; end if;
  select * into org from public.organizations where id=new.organization_id;
  if org.organization_type='institution' and org.subscription_owner_user_id is not null
     and public.has_active_student_plan(org.subscription_owner_user_id,'college_yearly') then
    new.contract_included := true;
  elsif org.organization_type='organisation' and org.subscription_status='active'
     and org.subscription_plan='organisation_custom'
     and (org.contract_access_until is null or org.contract_access_until>now())
     and (org.event_limit is null or (select count(*) from public.events e where e.organization_id=org.id)<org.event_limit) then
    new.contract_included := true;
  end if;
  return new;
end;
$$;
drop trigger if exists set_event_contract_entitlement_trg on public.events;
create trigger set_event_contract_entitlement_trg before insert on public.events
for each row execute function public.set_event_contract_entitlement();

create or replace function public.is_org_admin(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m
    where m.organization_id=p_org and m.user_id=p_user
      and m.membership_status='active' and m.role in ('owner','admin'));
$$;

create or replace function public.is_org_manager(p_org uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.organization_members m
    join public.organizations o on o.id=m.organization_id
    where m.organization_id=p_org and m.user_id=p_user
      and m.membership_status='active'
      and m.role in ('owner','admin','event_manager')
      and exists(select 1 from public.student_profiles p where p.id=p_user and p.account_type=o.organization_type)
      and o.verification_status='verified'
  );
$$;



-- When the existing PayPal subscription row is verified/activated by the current
-- subscription-manage Edge Function, reflect that entitlement on the institution workspace.
-- The PayPal flow itself is unchanged.
create or replace function public.sync_institution_subscription_entitlement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.organizations o
    set subscription_status = case
      when new.status='ACTIVE' or (new.status='CANCELLED' and new.access_until>now()) then 'active'
      else 'inactive' end,
      subscription_plan = case when new.plan_key='college_yearly' then 'college_yearly' else o.subscription_plan end,
      updated_at=now()
    where o.organization_type='institution'
      and o.subscription_owner_user_id=new.user_id;
  if new.plan_key='college_yearly' and (new.status='ACTIVE' or (new.status='CANCELLED' and new.access_until>now())) then
    update public.events e set contract_included=true
      from public.organizations o
      where e.organization_id=o.id and o.organization_type='institution'
        and o.subscription_owner_user_id=new.user_id and e.status='draft';
  end if;
  return new;
end;
$$;
drop trigger if exists subscriptions_sync_institution_entitlement on public.subscriptions;
create trigger subscriptions_sync_institution_entitlement
  after insert or update of status, access_until, plan_key on public.subscriptions
  for each row execute function public.sync_institution_subscription_entitlement();

create or replace function public.can_create_event_for_workspace(p_org uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_org_manager(p_org,auth.uid());
$$;

create or replace function public.can_create_collivra_event()
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.student_profiles p
    where p.id=auth.uid()
      and p.account_type in ('institution','organisation')
  );
$$;

create or replace function public.can_manage_collivra_event(p_event uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.events e
    where e.id=p_event and (
      (e.organization_id is not null and public.is_org_manager(e.organization_id,auth.uid()))
      or (e.organization_id is null and e.organizer_id=auth.uid()
          and exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type='institution')
          and public.has_active_student_plan(auth.uid(),'college_yearly'))
    )
  );
$$;

create or replace function public.can_review_collivra_event(p_event uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select public.can_manage_collivra_event(p_event)
    or exists(
      select 1 from public.events e
      join public.organization_members m on m.organization_id=e.organization_id
      join public.organizations o on o.id=e.organization_id
      where e.id=p_event and m.user_id=p_user and m.role='judge'
        and m.membership_status='active' and o.verification_status='verified'
    );
$$;



-- Events are created only by an institution/organisation account with verified workspace entitlement.
drop policy if exists "organizer creates draft event" on public.events;
create policy "verified workspace creates draft event"
  on public.events for insert to authenticated
  with check (
    organizer_id=auth.uid() and status='draft' and paid_at is null
    and public.can_create_collivra_event()
    and organization_id is not null
    and public.is_org_manager(organization_id,auth.uid())
    and public.can_create_event_for_workspace(organization_id)
  );

drop policy if exists "organizer edits own event" on public.events;
create policy "workspace managers edit own event"
  on public.events for update to authenticated
  using (public.can_manage_collivra_event(id))
  with check (public.can_manage_collivra_event(id));

drop policy if exists "organizer deletes own unpaid event" on public.events;
create policy "workspace managers delete unpaid event"
  on public.events for delete to authenticated
  using (public.can_manage_collivra_event(id) and status in ('draft','pending_payment'));


-- A draft remains private. Institutions on an active College subscription can publish
-- without an Event Pass; other workspaces must complete the existing Event Pass checkout.
alter table public.events drop constraint if exists events_status_check;
alter table public.events add constraint events_status_check
  check (status in ('draft','pending_payment','published','paid','teams_formed'));

drop policy if exists "events readable by signed-in users" on public.events;
create policy "events readable by signed-in users" on public.events for select to authenticated
  using (
    status in ('published','paid','teams_formed')
    or organizer_id=auth.uid()
    or public.can_manage_collivra_event(id)
  );

drop policy if exists "students join open events" on public.event_participants;
create policy "students join published events" on public.event_participants for insert to authenticated
  with check (
    student_id=auth.uid()
    and exists(select 1 from public.events e where e.id=event_id and e.status in ('published','paid')
      and (e.registration_opens_at is null or e.registration_opens_at<=now())
      and (e.registration_deadline_at is null or e.registration_deadline_at>now()))
  );

-- Workflow engine: flexible stages, multiple activities per stage, and participant submissions.
create table if not exists public.event_stages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text,
  stage_order int not null default 1,
  starts_at timestamptz,
  deadline_at timestamptz,
  reminder_sent_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','open','closed','results_published')),
  advancement_mode text not null default 'manual' check (advancement_mode in ('manual','automatic')),
  allow_edits boolean not null default false,
  created_at timestamptz not null default now(),
  unique(event_id,stage_order)
);
create table if not exists public.event_activities (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references public.event_stages(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  instructions text,
  activity_type text not null check (activity_type in ('form','quiz','file_submission','link_submission','presentation','evaluation','announcement')),
  required boolean not null default true,
  team_submission boolean not null default false,
  config jsonb not null default '{}'::jsonb,
  activity_order int not null default 1,
  created_at timestamptz not null default now()
);
create table if not exists public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.event_activities(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  stage_id uuid not null references public.event_stages(id) on delete cascade,
  submitted_by uuid not null references public.student_profiles(id) on delete cascade,
  team_id uuid,
  response jsonb not null default '{}'::jsonb,
  file_url text,
  external_url text,
  status text not null default 'submitted' check (status in ('draft','submitted','late','reviewed','accepted','rejected')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists event_submissions_unique_user_activity
  on public.event_submissions(activity_id,submitted_by) where team_id is null;
create unique index if not exists event_submissions_unique_team_activity
  on public.event_submissions(activity_id,team_id) where team_id is not null;
create table if not exists public.event_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.event_submissions(id) on delete cascade,
  evaluator_id uuid not null references public.student_profiles(id),
  score numeric(6,2),
  feedback text,
  decision text check (decision in ('advance','reject','hold')),
  created_at timestamptz not null default now(),
  unique(submission_id,evaluator_id)
);
create table if not exists public.event_stage_advancements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  from_stage_id uuid not null references public.event_stages(id) on delete cascade,
  to_stage_id uuid not null references public.event_stages(id) on delete cascade,
  participant_id uuid not null references public.student_profiles(id) on delete cascade,
  decision text not null check (decision in ('advanced','not_advanced','pending')),
  decided_by uuid references public.student_profiles(id),
  decided_at timestamptz,
  unique(from_stage_id,to_stage_id,participant_id)
);
create table if not exists public.event_notifications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  title text not null,
  message text not null,
  notification_type text not null default 'event',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists event_stages_event_order_idx on public.event_stages(event_id,stage_order);
create index if not exists event_activities_stage_order_idx on public.event_activities(stage_id,activity_order);
create index if not exists event_submissions_event_idx on public.event_submissions(event_id,stage_id);
create index if not exists event_notifications_user_idx on public.event_notifications(user_id,created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_verification_requests enable row level security;
alter table public.event_stages enable row level security;
alter table public.event_activities enable row level security;
alter table public.event_submissions enable row level security;
alter table public.event_evaluations enable row level security;
alter table public.event_stage_advancements enable row level security;
alter table public.event_notifications enable row level security;

drop policy if exists "organization members read their orgs" on public.organizations;
create policy "organization members read their orgs" on public.organizations for select to authenticated
  using (exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid()));
drop policy if exists "users create org workspaces" on public.organizations;
create policy "users create org workspaces" on public.organizations for insert to authenticated
  with check (created_by=auth.uid() and exists(select 1 from public.student_profiles p where p.id=auth.uid() and p.account_type=organization_type));
drop policy if exists "org admins update workspace" on public.organizations;
create policy "org admins update workspace" on public.organizations for update to authenticated
  using (exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid() and m.role in ('owner','admin') and m.membership_status='active'))
  with check (exists(select 1 from public.organization_members m where m.organization_id=id and m.user_id=auth.uid() and m.role in ('owner','admin') and m.membership_status='active'));

drop policy if exists "members read memberships" on public.organization_members;
create policy "members read memberships" on public.organization_members for select to authenticated
  using (user_id=auth.uid() or public.is_org_admin(organization_id,auth.uid()));
drop policy if exists "creator becomes org owner" on public.organization_members;
create policy "creator becomes org owner" on public.organization_members for insert to authenticated
  with check (user_id=auth.uid() and role='owner' and public.is_org_admin(organization_id,auth.uid()));
drop policy if exists "org admins manage members" on public.organization_members;
create policy "org admins manage members" on public.organization_members for update to authenticated
  using (public.is_org_admin(organization_id,auth.uid()))
  with check (public.is_org_admin(organization_id,auth.uid()));

drop policy if exists "org verification visible to members" on public.organization_verification_requests;
create policy "org verification visible to members" on public.organization_verification_requests for select to authenticated
  using (exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid()));
drop policy if exists "org owner submits verification" on public.organization_verification_requests;
create policy "org owner submits verification" on public.organization_verification_requests for insert to authenticated
  with check (submitted_by=auth.uid() and exists(select 1 from public.organization_members m where m.organization_id=organization_id and m.user_id=auth.uid() and m.role in ('owner','admin')));

create or replace function public.can_access_event_stage(p_stage uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.event_stages s
    join public.event_participants p on p.event_id=s.event_id and p.student_id=p_user
    where s.id=p_stage and (
      s.stage_order=1
      or exists (
        select 1 from public.event_stage_advancements a
        where a.to_stage_id=s.id and a.participant_id=p_user and a.decision='advanced'
      )
    )
  );
$$;

-- Stage/activities are readable to event participants; only entitled workspace managers may author them.
drop policy if exists "event stages readable" on public.event_stages;
create policy "event stages readable" on public.event_stages for select to authenticated
  using (public.can_manage_collivra_event(event_id) or public.can_review_collivra_event(event_id,auth.uid()) or public.can_access_event_stage(id,auth.uid()));
drop policy if exists "event managers manage stages" on public.event_stages;
create policy "event managers manage stages" on public.event_stages for all to authenticated
  using (public.can_manage_collivra_event(event_id)) with check (public.can_manage_collivra_event(event_id));

drop policy if exists "event activities readable" on public.event_activities;
create policy "event activities readable" on public.event_activities for select to authenticated
  using (exists(select 1 from public.event_stages s where s.id=stage_id and (public.can_manage_collivra_event(s.event_id) or public.can_review_collivra_event(s.event_id,auth.uid()) or public.can_access_event_stage(s.id,auth.uid()))));
drop policy if exists "event managers manage activities" on public.event_activities;
create policy "event managers manage activities" on public.event_activities for all to authenticated
  using (exists(select 1 from public.event_stages s where s.id=stage_id and public.can_manage_collivra_event(s.event_id)))
  with check (exists(select 1 from public.event_stages s where s.id=stage_id and public.can_manage_collivra_event(s.event_id)));

drop policy if exists "submissions visible to submitter and managers" on public.event_submissions;
create policy "submissions visible to submitter and managers" on public.event_submissions for select to authenticated
  using (submitted_by=auth.uid() or public.can_manage_collivra_event(event_id) or public.can_review_collivra_event(event_id,auth.uid()));
drop policy if exists "participants submit to open event activities" on public.event_submissions;
create policy "participants submit to open event activities" on public.event_submissions for insert to authenticated
  with check (
    submitted_by=auth.uid()
    and exists(select 1 from public.event_participants p where p.event_id=event_submissions.event_id and p.student_id=auth.uid())
    and exists(select 1 from public.event_stages s where s.id=stage_id and s.event_id=event_id and s.status='open' and (s.deadline_at is null or s.deadline_at>=now()))
    and public.can_access_event_stage(stage_id,auth.uid())
    and exists(select 1 from public.event_activities a where a.id=activity_id and a.stage_id=stage_id)
    and (
      team_id is null
      or exists(select 1 from public.event_team_members tm where tm.event_team_id=team_id and tm.student_id=auth.uid())
    )
  );
drop policy if exists "submitter edits own draft or allowed submission" on public.event_submissions;
create policy "submitter edits own draft or allowed submission" on public.event_submissions for update to authenticated
  using (submitted_by=auth.uid() and status in ('draft','submitted') and exists(select 1 from public.event_stages s where s.id=stage_id and s.allow_edits and s.status='open'))
  with check (submitted_by=auth.uid());

drop policy if exists "evaluations readable by submitter and managers" on public.event_evaluations;
create policy "evaluations readable by submitter and managers" on public.event_evaluations for select to authenticated
  using (exists(select 1 from public.event_submissions s where s.id=submission_id and (s.submitted_by=auth.uid() or public.can_manage_collivra_event(s.event_id) or public.can_review_collivra_event(s.event_id,auth.uid()))));
drop policy if exists "event managers evaluate" on public.event_evaluations;
create policy "event managers evaluate" on public.event_evaluations for insert to authenticated
  with check (evaluator_id=auth.uid() and exists(select 1 from public.event_submissions s where s.id=submission_id and public.can_review_collivra_event(s.event_id,auth.uid())));
drop policy if exists "event managers update evaluations" on public.event_evaluations;
create policy "event managers update evaluations" on public.event_evaluations for update to authenticated
  using (evaluator_id=auth.uid() and exists(select 1 from public.event_submissions s where s.id=submission_id and public.can_review_collivra_event(s.event_id,auth.uid())))
  with check (evaluator_id=auth.uid());

drop policy if exists "advancements visible to participant and managers" on public.event_stage_advancements;
create policy "advancements visible to participant and managers" on public.event_stage_advancements for select to authenticated
  using (participant_id=auth.uid() or public.can_manage_collivra_event(event_id));
drop policy if exists "event managers decide advancement" on public.event_stage_advancements;
create policy "event managers decide advancement" on public.event_stage_advancements for all to authenticated
  using (public.can_manage_collivra_event(event_id)) with check (public.can_manage_collivra_event(event_id));

drop policy if exists "users read own event notifications" on public.event_notifications;
create policy "users read own event notifications" on public.event_notifications for select to authenticated using (user_id=auth.uid());
drop policy if exists "users mark own event notifications read" on public.event_notifications;
create policy "users mark own event notifications read" on public.event_notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());


drop policy if exists "event managers review submissions" on public.event_submissions;
create policy "event managers review submissions" on public.event_submissions for update to authenticated
  using (public.can_manage_collivra_event(event_id))
  with check (public.can_manage_collivra_event(event_id));


create or replace function public.auto_advance_event_participant()
returns trigger language plpgsql security definer set search_path=public as $$
declare sub public.event_submissions%rowtype;
declare current_stage public.event_stages%rowtype;
declare next_stage public.event_stages%rowtype;
begin
  if new.decision <> 'advance' then return new; end if;
  select * into sub from public.event_submissions where id=new.submission_id;
  select * into current_stage from public.event_stages where id=sub.stage_id;
  if current_stage.advancement_mode <> 'automatic' then return new; end if;
  select * into next_stage from public.event_stages
    where event_id=current_stage.event_id and stage_order>current_stage.stage_order
    order by stage_order limit 1;
  if next_stage.id is not null then
    insert into public.event_stage_advancements(event_id,from_stage_id,to_stage_id,participant_id,decision,decided_by,decided_at)
    values(current_stage.event_id,current_stage.id,next_stage.id,sub.submitted_by,'advanced',new.evaluator_id,now())
    on conflict(from_stage_id,to_stage_id,participant_id) do update set decision='advanced',decided_by=new.evaluator_id,decided_at=now();
  end if;
  return new;
end;
$$;
drop trigger if exists auto_advance_event_participant_trg on public.event_evaluations;
create trigger auto_advance_event_participant_trg after insert or update of decision on public.event_evaluations
for each row execute function public.auto_advance_event_participant();


create or replace function public.notify_event_registration()
returns trigger language plpgsql security definer set search_path=public as $$
declare event_name text;
begin
  select name into event_name from public.events where id=new.event_id;
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
  values(new.event_id,new.student_id,'Registration confirmed',
    'You are registered for ' || coalesce(event_name,'the event') || '. Check the event timeline for upcoming tasks.','registration');
  return new;
end;
$$;
drop trigger if exists event_registration_notify_trg on public.event_participants;
create trigger event_registration_notify_trg after insert on public.event_participants
for each row execute function public.notify_event_registration();

create or replace function public.notify_event_stage_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare msg text;
begin
  if new.status is distinct from old.status and new.status in ('open','closed','results_published') then
    msg := case new.status when 'open' then 'A new event stage is now open: ' || new.title
      when 'closed' then 'The stage has closed: ' || new.title
      else 'Results have been published for: ' || new.title end;
    insert into public.event_notifications(event_id,user_id,title,message,notification_type)
      select new.event_id,p.student_id,'Event update',msg,'stage'
      from public.event_participants p where p.event_id=new.event_id;
  end if;
  return new;
end;
$$;
drop trigger if exists event_stage_notify_trg on public.event_stages;
create trigger event_stage_notify_trg after update of status on public.event_stages
for each row execute function public.notify_event_stage_change();

create or replace function public.notify_event_submission()
returns trigger language plpgsql security definer set search_path=public as $$
declare activity_title text;
begin
  select title into activity_title from public.event_activities where id=new.activity_id;
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
  values(new.event_id,new.submitted_by,'Submission received',
    'Your submission for ' || coalesce(activity_title,'the activity') || ' has been received.','submission');
  return new;
end;
$$;
drop trigger if exists event_submission_notify_trg on public.event_submissions;
create trigger event_submission_notify_trg after insert on public.event_submissions
for each row execute function public.notify_event_submission();

-- Call this function from Supabase Cron (or a trusted scheduled worker) every minute.
-- It opens stages at starts_at and closes them at deadline_at; trigger notifications are automatic.
create or replace function public.process_event_stage_schedule()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  update public.event_stages set status='open'
    where status in ('draft','scheduled') and starts_at is not null and starts_at<=now();
  get diagnostics changed = row_count;
  update public.event_stages set status='closed'
    where status='open' and deadline_at is not null and deadline_at<=now();

  with due as (
    update public.event_stages s set reminder_sent_at=now()
    where s.status='open' and s.reminder_sent_at is null
      and s.deadline_at between now() and now()+interval '24 hours'
    returning s.event_id,s.title,s.deadline_at
  )
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
    select d.event_id,p.student_id,'Deadline reminder',
      'The deadline for ' || d.title || ' is ' || to_char(d.deadline_at,'DD Mon YYYY HH24:MI') || '.','deadline'
    from due d join public.event_participants p on p.event_id=d.event_id;

  with registration_due as (
    update public.events e set registration_reminder_sent_at=now()
    where e.status in ('published','paid') and e.registration_reminder_sent_at is null
      and e.registration_deadline_at between now() and now()+interval '24 hours'
    returning e.id,e.name,e.registration_deadline_at
  )
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
    select d.id,p.student_id,'Registration closing soon',
      'Registration for ' || d.name || ' closes at ' || to_char(d.registration_deadline_at,'DD Mon YYYY HH24:MI') || '.','deadline'
    from registration_due d join public.event_participants p on p.event_id=d.id;
  return changed;
end;
$$;


-- Private evidence uploads. The app stores object paths, not public file URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('event-submissions','event-submissions',false,20971520,
  array['application/pdf','image/png','image/jpeg','image/webp','application/zip','text/plain'])
on conflict(id) do nothing;

drop policy if exists "participants upload event work" on storage.objects;
create policy "participants upload event work" on storage.objects for insert to authenticated
with check (
  bucket_id='event-submissions'
  and (storage.foldername(name))[2]=auth.uid()::text
  and exists(select 1 from public.event_participants p where p.event_id=(storage.foldername(name))[1]::uuid and p.student_id=auth.uid())
);
drop policy if exists "participants and managers read event work" on storage.objects;
create policy "participants and managers read event work" on storage.objects for select to authenticated
using (
  bucket_id='event-submissions'
  and (
    (storage.foldername(name))[2]=auth.uid()::text
    or exists(select 1 from public.events e where e.id=(storage.foldername(name))[1]::uuid and public.can_manage_collivra_event(e.id))
  )
);


create table if not exists public.event_certificates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.student_profiles(id) on delete cascade,
  issued_by uuid not null references public.student_profiles(id),
  certificate_number text not null unique,
  title text not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique(event_id,participant_id)
);
alter table public.event_certificates enable row level security;
drop policy if exists "participants and managers read certificates" on public.event_certificates;
create policy "participants and managers read certificates" on public.event_certificates for select to authenticated
  using (participant_id=auth.uid() or public.can_manage_collivra_event(event_id));
drop policy if exists "event managers issue certificates" on public.event_certificates;
create policy "event managers issue certificates" on public.event_certificates for insert to authenticated
  with check (issued_by=auth.uid() and public.can_manage_collivra_event(event_id));


create or replace function public.notify_event_advancement()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
  values(new.event_id,new.participant_id,
    case when new.decision='advanced' then 'You advanced to the next stage' else 'Stage decision updated' end,
    case when new.decision='advanced' then 'You have been advanced to the next event stage.' else 'Your stage decision is: ' || new.decision || '.' end,
    'advancement');
  return new;
end;
$$;
drop trigger if exists event_advancement_notify_trg on public.event_stage_advancements;
create trigger event_advancement_notify_trg after insert or update of decision on public.event_stage_advancements
for each row execute function public.notify_event_advancement();

create or replace function public.notify_event_certificate()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.event_notifications(event_id,user_id,title,message,notification_type)
  values(new.event_id,new.participant_id,'Certificate issued',
    'Your certificate is ready to view and print. Certificate ID: ' || new.certificate_number,'certificate');
  return new;
end;
$$;
drop trigger if exists event_certificate_notify_trg on public.event_certificates;
create trigger event_certificate_notify_trg after insert on public.event_certificates
for each row execute function public.notify_event_certificate();

commit;
