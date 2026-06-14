create table if not exists public.groups (
  id uuid primary key,
  title text not null,
  description text default '',
  creator_key text not null,
  invite_code text not null unique,
  date_start date not null,
  date_end date not null,
  allowed_weekdays integer[] not null default '{0,1,2,3,4,5,6}',
  time_start text not null,
  time_end text not null,
  slot_minutes integer not null check (slot_minutes in (30, 60)),
  deadline timestamptz not null,
  visibility text not null check (visibility in ('link', 'private')),
  status text not null default 'open' check (status in ('open', 'closed', 'deleted')),
  finalized_slot jsonb,
  created_at timestamptz not null default now()
);

alter table public.groups
add column if not exists allowed_weekdays integer[] not null default '{0,1,2,3,4,5,6}';

create table if not exists public.participants (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.availability (
  id uuid primary key,
  group_id uuid not null references public.groups(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  date date not null,
  start_time text not null,
  end_time text not null,
  unique (participant_id, date, start_time)
);

create index if not exists groups_invite_code_idx on public.groups(invite_code);
create index if not exists participants_group_id_idx on public.participants(group_id);
create index if not exists availability_group_id_idx on public.availability(group_id);

alter table public.groups enable row level security;
alter table public.participants enable row level security;
alter table public.availability enable row level security;

create policy "anonymous mvp read groups" on public.groups for select using (status <> 'deleted');
create policy "anonymous mvp insert groups" on public.groups for insert with check (true);
create policy "anonymous mvp update groups" on public.groups for update using (true) with check (true);

create policy "anonymous mvp read participants" on public.participants for select using (true);
create policy "anonymous mvp insert participants" on public.participants for insert with check (true);
create policy "anonymous mvp update participants" on public.participants for update using (true) with check (true);

create policy "anonymous mvp read availability" on public.availability for select using (true);
create policy "anonymous mvp insert availability" on public.availability for insert with check (true);
create policy "anonymous mvp delete availability" on public.availability for delete using (true);
