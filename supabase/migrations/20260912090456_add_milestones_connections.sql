-- Milestones
create table if not exists milestones (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  title text not null,
  due_date date,
  status text default 'upcoming',
  created_at timestamp with time zone default now()
);
alter table milestones enable row level security;
create policy "Anyone can view milestones" on milestones for select using (true);
create policy "Authenticated users can manage milestones" on milestones for all using (auth.uid() is not null);

-- Connections (Find People)
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references student_profiles(id) on delete cascade,
  receiver_id uuid references student_profiles(id) on delete cascade,
  status text default 'pending',
  created_at timestamp with time zone default now()
);
alter table connections enable row level security;
create policy "Anyone can view connections" on connections for select using (true);
create policy "Users can send connections" on connections for insert with check (auth.uid() = sender_id);
create policy "Receiver can update connection" on connections for update using (auth.uid() = receiver_id);
