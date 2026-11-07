-- Collivra Smart Mentor Matching: Sub-phase 7
-- Mentor Booking System and Payment Transactions Architecture
-- Integrates server-side payment verification, booking lifecycle transitions, and settlement separation.

begin;

-- 1. Mentor Bookings Table
create table if not exists public.mentor_bookings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  mentor_id uuid not null references public.mentor_profiles(id) on delete cascade,
  package_id uuid not null references public.mentor_packages(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  subscription_id uuid references public.mentor_subscriptions(id) on delete set null,
  status text not null default 'pending_payment' check (
    status in (
      'pending_payment',
      'payment_verified',
      'awaiting_acceptance',
      'confirmed',
      'rejected',
      'cancelled',
      'completed',
      'refund_pending',
      'refunded'
    )
  ),
  session_scheduled_at timestamptz not null,
  session_duration_minutes int not null default 60 check (session_duration_minutes between 15 and 240),
  proposed_alternative_times text[] not null default '{}'::text[],
  meeting_link text,
  student_notes text,
  mentor_notes text,
  rejection_reason text,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_bookings_student on public.mentor_bookings(student_id);
create index if not exists idx_mentor_bookings_mentor on public.mentor_bookings(mentor_id);
create index if not exists idx_mentor_bookings_status on public.mentor_bookings(status);
create index if not exists idx_mentor_bookings_scheduled on public.mentor_bookings(session_scheduled_at);

drop trigger if exists tr_mentor_bookings_updated_at on public.mentor_bookings;
create trigger tr_mentor_bookings_updated_at
  before update on public.mentor_bookings
  for each row execute function public.set_updated_at();

-- 2. Mentor Payment Transactions Table
create table if not exists public.mentor_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.mentor_bookings(id) on delete cascade,
  student_id uuid not null references auth.users(id),
  mentor_id uuid not null references public.mentor_profiles(id),
  paypal_order_id text unique,
  paypal_capture_id text unique,
  amount numeric(8,2) not null check (amount >= 0),
  currency text not null default 'USD',
  status text not null check (status in ('created', 'captured', 'failed', 'refunded')),
  idempotency_key text unique,
  failure_reason text,
  refund_reason text,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mentor_payments_booking on public.mentor_payment_transactions(booking_id);
create index if not exists idx_mentor_payments_student on public.mentor_payment_transactions(student_id);
create index if not exists idx_mentor_payments_mentor on public.mentor_payment_transactions(mentor_id);
create index if not exists idx_mentor_payments_status on public.mentor_payment_transactions(status);

drop trigger if exists tr_mentor_payments_updated_at on public.mentor_payment_transactions;
create trigger tr_mentor_payments_updated_at
  before update on public.mentor_payment_transactions
  for each row execute function public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

alter table public.mentor_bookings enable row level security;
alter table public.mentor_payment_transactions enable row level security;

-- Mentor Bookings RLS
drop policy if exists "Students can view own bookings" on public.mentor_bookings;
create policy "Students can view own bookings"
  on public.mentor_bookings for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "Mentors can view their bookings" on public.mentor_bookings;
create policy "Mentors can view their bookings"
  on public.mentor_bookings for select to authenticated
  using (
    exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

drop policy if exists "Students can insert booking requests" on public.mentor_bookings;
create policy "Students can insert booking requests"
  on public.mentor_bookings for insert to authenticated
  with check (student_id = auth.uid());

drop policy if exists "Parties can update their relevant booking fields" on public.mentor_bookings;
create policy "Parties can update their relevant booking fields"
  on public.mentor_bookings for update to authenticated
  using (
    student_id = auth.uid()
    or exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

-- Mentor Payment Transactions RLS
drop policy if exists "Students can view own payment transactions" on public.mentor_payment_transactions;
create policy "Students can view own payment transactions"
  on public.mentor_payment_transactions for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "Mentors can view their payment transactions" on public.mentor_payment_transactions;
create policy "Mentors can view their payment transactions"
  on public.mentor_payment_transactions for select to authenticated
  using (
    exists (
      select 1 from public.mentor_profiles m
      where m.id = mentor_id and m.user_id = auth.uid()
    )
  );

commit;

notify pgrst, 'reload schema';

