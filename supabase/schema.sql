-- CityFix AI: starter schema for a future Supabase backend.
-- Run only in a new Supabase project after reviewing the security notes.
create extension if not exists pgcrypto;

create type public.issue_status as enum ('open', 'in_progress', 'resolved');
create type public.issue_priority as enum ('normal', 'high', 'critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 5 and 120),
  description text check (char_length(description) <= 2000),
  category text not null check (category in ('road_damage','garbage','waterlogging','streetlight','other')),
  location_label text not null check (char_length(location_label) <= 180),
  latitude double precision,
  longitude double precision,
  photo_path text,
  priority public.issue_priority not null default 'normal',
  priority_reason text,
  status public.issue_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_lat check (latitude is null or latitude between -90 and 90),
  constraint valid_lon check (longitude is null or longitude between -180 and 180)
);

create table public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  old_status public.issue_status,
  new_status public.issue_status not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index issues_created_at_idx on public.issues(created_at desc);
create index issues_status_priority_idx on public.issues(status, priority);
create index issues_location_idx on public.issues(latitude, longitude);

alter table public.profiles enable row level security;
alter table public.issues enable row level security;
alter table public.issue_events enable row level security;

-- Profiles: users can view/update only their own profile.
create policy "profile_select_own" on public.profiles
for select to authenticated using (auth.uid() = id);
create policy "profile_update_own" on public.profiles
for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profile_insert_own" on public.profiles
for insert to authenticated with check (auth.uid() = id);

-- Issues: authenticated users can read issues and create reports as themselves.
-- Public anonymous browsing is intentionally not enabled by this starter schema.
create policy "issues_read_authenticated" on public.issues
for select to authenticated using (true);
create policy "issues_insert_own" on public.issues
for insert to authenticated with check (auth.uid() = reporter_id);
create policy "issues_update_reporter" on public.issues
for update to authenticated using (auth.uid() = reporter_id)
with check (auth.uid() = reporter_id);

-- Issue event history: authenticated users can read event history.
create policy "events_read_authenticated" on public.issue_events
for select to authenticated using (true);
-- Status transitions should be written through a trusted server/admin function,
-- not directly from an untrusted browser client.
