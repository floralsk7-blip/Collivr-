-- COLLIVRA invoices / payment history.
-- Additive and idempotent: creates NEW objects only. It does not alter or delete subscriptions,
-- payments, events, profiles or any other existing data, and it does not touch the PayPal flow.
--
-- One invoice = one verified, successful PayPal payment.
--   event_pass    <- public.payments rows with status 'captured' (verified by paypal-capture-order)
--   subscription  <- COMPLETED transactions that PayPal itself reports for the user's own
--                    subscriptions (written by the invoice-manage edge function)
-- Nothing is ever invented: a payment missing a transaction id, amount, currency or date gets no invoice.

begin;

create sequence if not exists public.invoice_number_seq start 1;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid not null references public.student_profiles(id) on delete cascade,
  -- Stable link back to the original payment record. Unique => no duplicate invoice per payment.
  source_type text not null check (source_type in ('event_pass', 'subscription')),
  source_ref text not null,
  transaction_id text not null check (char_length(trim(transaction_id)) > 0),
  description text not null,
  plan_key text,
  amount numeric(10, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  payment_method text not null default 'PayPal',
  status text not null default 'paid' check (status = 'paid'),
  paid_at timestamptz not null,
  -- Customer details as they were when the invoice was issued (only what the database has).
  customer_name text,
  customer_email text,
  customer_organisation text,
  account_type text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_type, source_ref)
);

create index if not exists invoices_user_paid_idx on public.invoices (user_id, paid_at desc);

-- Human readable, unique, chronological number: COL-2026-000001
create or replace function public.assign_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'COL-' || to_char(new.paid_at at time zone 'UTC', 'YYYY') || '-'
      || lpad(nextval('public.invoice_number_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

-- invoice_number is NOT NULL, so give it a placeholder default that the trigger replaces.
alter table public.invoices alter column invoice_number set default '';
drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number before insert on public.invoices
  for each row execute function public.assign_invoice_number();

-- Invoices are records: once issued they are never edited (no API role has write access either).
create or replace function public.invoices_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'Invoices cannot be changed once issued';
end;
$$;
drop trigger if exists invoices_no_update on public.invoices;
create trigger invoices_no_update before update on public.invoices
  for each row execute function public.invoices_immutable();

-- ---------------------------------------------------------------------------
-- Row level security: a user can read ONLY their own invoices. No write policies at all.
-- ---------------------------------------------------------------------------
alter table public.invoices enable row level security;
drop policy if exists "users read own invoices" on public.invoices;
create policy "users read own invoices"
  on public.invoices for select to authenticated using (user_id = auth.uid());
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;

-- ---------------------------------------------------------------------------
-- The single place invoices are created. Callable by the database itself (triggers, backfill)
-- and by the service role (edge functions). Not callable by browsers.
-- Returns the invoice id, or null when the payment is not eligible / already invoiced.
-- ---------------------------------------------------------------------------
create or replace function public.record_invoice(
  p_user uuid,
  p_source_type text,
  p_source_ref text,
  p_transaction_id text,
  p_description text,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz,
  p_plan_key text default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  prof public.student_profiles%rowtype;
  mail text;
  new_id uuid;
begin
  -- Refuse anything that is not a complete, real payment.
  if p_user is null or p_source_ref is null or coalesce(trim(p_transaction_id), '') = ''
     or p_amount is null or p_amount <= 0 or p_paid_at is null
     or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$'
     or coalesce(trim(p_description), '') = '' then
    return null;
  end if;

  select * into prof from public.student_profiles where id = p_user;
  if not found then return null; end if;
  select u.email into mail from auth.users u where u.id = p_user;

  insert into public.invoices (
    user_id, source_type, source_ref, transaction_id, description, plan_key,
    amount, currency, paid_at, customer_name, customer_email, customer_organisation,
    account_type, metadata
  ) values (
    p_user, p_source_type, p_source_ref, trim(p_transaction_id), trim(p_description), p_plan_key,
    round(p_amount, 2), upper(p_currency), p_paid_at, nullif(trim(coalesce(prof.name, '')), ''), mail,
    nullif(trim(coalesce(prof.college, '')), ''), prof.account_type, coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (source_type, source_ref) do nothing
  returning id into new_id;

  return new_id;
end;
$$;
revoke all on function public.record_invoice(uuid, text, text, text, text, numeric, text, timestamptz, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_invoice(uuid, text, text, text, text, numeric, text, timestamptz, text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Event Pass: invoice automatically when a payment becomes 'captured'.
-- Never allowed to break the payment flow: any problem here is logged, not raised.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_event_pass_payment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  ev_name text;
begin
  if new.status = 'captured' and new.paypal_capture_id is not null and new.captured_at is not null then
    select e.name into ev_name from public.events e where e.id = new.event_id;
    perform public.record_invoice(
      new.payer_id, 'event_pass', new.id::text, new.paypal_capture_id,
      'COLLIVRA Event Pass' || case when ev_name is not null then ': ' || ev_name else '' end,
      new.amount, new.currency, new.captured_at, null,
      jsonb_build_object('event_id', new.event_id, 'paypal_order_id', new.paypal_order_id)
    );
  end if;
  return new;
exception when others then
  raise warning 'invoice_event_pass_payment failed for payment %: %', new.id, sqlerrm;
  return new;
end;
$$;
drop trigger if exists payments_create_invoice on public.payments;
create trigger payments_create_invoice
  after insert or update of status, paypal_capture_id, captured_at on public.payments
  for each row execute function public.invoice_event_pass_payment();

-- ---------------------------------------------------------------------------
-- Backfill: invoices for Event Pass payments that were ALREADY captured.
-- Oldest first, so invoice numbers follow payment order. Incomplete rows are skipped, not guessed.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  made int := 0;
  skipped int := 0;
  inv uuid;
begin
  for r in
    select p.*, e.name as event_name
    from public.payments p
    left join public.events e on e.id = p.event_id
    where p.status = 'captured'
    order by p.captured_at nulls last, p.created_at
  loop
    inv := null;
    if r.paypal_capture_id is not null and r.captured_at is not null then
      inv := public.record_invoice(
        r.payer_id, 'event_pass', r.id::text, r.paypal_capture_id,
        'COLLIVRA Event Pass' || case when r.event_name is not null then ': ' || r.event_name else '' end,
        r.amount, r.currency, r.captured_at, null,
        jsonb_build_object('event_id', r.event_id, 'paypal_order_id', r.paypal_order_id)
      );
    end if;
    if inv is null then
      -- either already invoiced (fine) or missing data (skipped)
      if not exists (select 1 from public.invoices i where i.source_type = 'event_pass' and i.source_ref = r.id::text) then
        skipped := skipped + 1;
      end if;
    else
      made := made + 1;
    end if;
  end loop;
  raise notice 'Invoice backfill: % created, % skipped for missing payment data', made, skipped;
end;
$$;

commit;
