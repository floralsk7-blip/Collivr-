-- COLLIVRA Event Pass
-- An organizer creates an event, pays a one-time per-event fee through PayPal,
-- and COLLIVRA then forms balanced teams for every participant.
--
-- Money only ever flows ONE WAY (organizer -> COLLIVRA). There are no payouts,
-- no pooled funds and no user-to-user transfers anywhere in this schema.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.student_profiles(id) on delete cascade,
  name text not null check (char_length(name) between 3 and 120),
  description text,
  domain text,
  team_size int not null default 4 check (team_size between 2 and 8),
  skills_focus text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'pending_payment', 'paid', 'teams_formed')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (event_id, student_id)
);

-- Audit trail of every PayPal order. Written ONLY by edge functions (service role).
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  payer_id uuid not null references public.student_profiles(id) on delete cascade,
  paypal_order_id text not null unique,
  paypal_capture_id text,
  amount numeric(10, 2) not null,
  currency text not null default 'USD',
  status text not null default 'created'
    check (status in ('created', 'captured', 'failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  captured_at timestamptz
);

create table if not exists public.event_teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  team_index int not null,
  score numeric(5, 1) not null,
  score_breakdown jsonb not null default '{}'::jsonb,
  missing_skills text[] not null default '{}',
  reasoning text,
  coaching_notes text,
  created_at timestamptz not null default now(),
  unique (event_id, team_index)
);

create table if not exists public.event_team_members (
  id uuid primary key default gen_random_uuid(),
  event_team_id uuid not null references public.event_teams(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  role text,
  unique (event_team_id, student_id)
);

create index if not exists events_organizer_idx on public.events (organizer_id);
create index if not exists event_participants_event_idx on public.event_participants (event_id);
create index if not exists payments_event_idx on public.payments (event_id);
create index if not exists event_teams_event_idx on public.event_teams (event_id);

-- ---------------------------------------------------------------------------
-- Guard: only the server (service role) may change status / payment fields.
-- Without this an organizer could simply mark their own event as "paid".
-- ---------------------------------------------------------------------------
create or replace function public.guard_event_columns()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if new.status is distinct from old.status
       or new.paid_at is distinct from old.paid_at
       or new.organizer_id is distinct from old.organizer_id then
      raise exception 'Event status and payment fields can only be changed by the server';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_event_columns_trg on public.events;
create trigger guard_event_columns_trg
  before update on public.events
  for each row execute function public.guard_event_columns();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.payments enable row level security;
alter table public.event_teams enable row level security;
alter table public.event_team_members enable row level security;

-- events
drop policy if exists "events readable by signed-in users" on public.events;
create policy "events readable by signed-in users"
  on public.events for select to authenticated using (true);

drop policy if exists "organizer creates draft event" on public.events;
create policy "organizer creates draft event"
  on public.events for insert to authenticated
  with check (organizer_id = auth.uid() and status = 'draft' and paid_at is null);

drop policy if exists "organizer edits own event" on public.events;
create policy "organizer edits own event"
  on public.events for update to authenticated
  using (organizer_id = auth.uid()) with check (organizer_id = auth.uid());

drop policy if exists "organizer deletes own unpaid event" on public.events;
create policy "organizer deletes own unpaid event"
  on public.events for delete to authenticated
  using (organizer_id = auth.uid() and status in ('draft', 'pending_payment'));

-- event_participants
drop policy if exists "participants readable by signed-in users" on public.event_participants;
create policy "participants readable by signed-in users"
  on public.event_participants for select to authenticated using (true);

drop policy if exists "students join open events" on public.event_participants;
create policy "students join open events"
  on public.event_participants for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status in ('draft', 'pending_payment', 'paid')
    )
  );

drop policy if exists "students leave events before teams form" on public.event_participants;
create policy "students leave events before teams form"
  on public.event_participants for delete to authenticated
  using (
    student_id = auth.uid()
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.status <> 'teams_formed'
    )
  );

-- payments: the payer can read their own rows. No insert/update/delete policy
-- exists, so only the service role (edge functions) can write.
drop policy if exists "payer reads own payments" on public.payments;
create policy "payer reads own payments"
  on public.payments for select to authenticated using (payer_id = auth.uid());

-- event_teams / members: readable by signed-in users, written only by the server.
drop policy if exists "event teams readable" on public.event_teams;
create policy "event teams readable"
  on public.event_teams for select to authenticated using (true);

drop policy if exists "event team members readable" on public.event_team_members;
create policy "event team members readable"
  on public.event_team_members for select to authenticated using (true);
