-- Collivra Smart Mentor Matching: PayPal Webhook & RLS Hardening
-- Migration: 20261119000000_paypal_webhook_and_rls_hardening.sql

begin;

-- 1. PayPal Webhook Events Idempotency Audit Table
create table if not exists public.paypal_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_id text unique not null,
  event_type text not null,
  resource_id text,
  status text not null default 'processed',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.paypal_webhook_events enable row level security;

-- Strictly restrict webhook events table to service role (no public/authenticated policies)
drop policy if exists "Service role only for webhook events" on public.paypal_webhook_events;
create policy "Service role only for webhook events"
  on public.paypal_webhook_events
  for all to service_role
  using (true)
  with check (true);

-- 2. Hardening RLS on mentor_payment_transactions
-- Allow authenticated students to insert pending payment records for their own bookings in 'created' status
drop policy if exists "Students can insert payment transactions for own bookings" on public.mentor_payment_transactions;
create policy "Students can insert payment transactions for own bookings"
  on public.mentor_payment_transactions for insert to authenticated
  with check (
    student_id = auth.uid()
    and status = 'created'
    and exists (
      select 1 from public.mentor_bookings b
      where b.id = booking_id and b.student_id = auth.uid()
    )
  );

-- 3. Security Definer trigger to guard mentor_bookings status transitions
create or replace function public.validate_mentor_booking_update()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    -- Students cannot directly advance a booking to confirmed or completed
    if auth.uid() = old.student_id and new.status in ('confirmed', 'completed') and auth.role() != 'service_role' then
      raise exception 'Students cannot directly confirm or complete mentorship bookings.';
    end if;
    -- Only payment system (service_role) or authorized flow can mark payment_verified
    if new.status = 'payment_verified' and auth.role() != 'service_role' and auth.uid() != old.student_id then
      raise exception 'Unauthorized payment verification status update.';
    end if;
  end if;
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists tr_validate_mentor_booking_update on public.mentor_bookings;
create trigger tr_validate_mentor_booking_update
  before update on public.mentor_bookings
  for each row execute function public.validate_mentor_booking_update();

commit;

notify pgrst, 'reload schema';

