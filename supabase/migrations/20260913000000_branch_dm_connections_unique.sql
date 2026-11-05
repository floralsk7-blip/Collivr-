-- Rename department to branch (keep both temporarily so nothing breaks)
alter table student_profiles add column if not exists branch text;
update student_profiles set branch = department where branch is null and department is not null;

-- Direct messages between two connected students (separate from team chat)
create table if not exists direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references student_profiles(id) on delete cascade,
  receiver_id uuid references student_profiles(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists dm_pair_idx on direct_messages (sender_id, receiver_id, created_at);

alter table direct_messages enable row level security;

do $$ begin
  create policy "users read own dms" on direct_messages
    for select using (auth.uid() = sender_id or auth.uid() = receiver_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "users send dms" on direct_messages
    for insert with check (auth.uid() = sender_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "receiver marks read" on direct_messages
    for update using (auth.uid() = receiver_id);
exception when duplicate_object then null; end $$;

-- Enable realtime on direct messages
alter publication supabase_realtime add table direct_messages;

-- Prevent duplicate connection requests at the database level
create unique index if not exists connections_unique_pair
  on connections (least(sender_id, receiver_id), greatest(sender_id, receiver_id));
