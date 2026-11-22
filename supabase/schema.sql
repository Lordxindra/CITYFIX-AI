-- CityFix AI production-oriented starter schema for Supabase.
-- Run once in a NEW Supabase project. Review before using real personal data.
create extension if not exists pgcrypto;

do $$ begin create type public.issue_status as enum ('open','in_progress','resolved');
exception when duplicate_object then null; end $$;
do $$ begin create type public.issue_priority as enum ('normal','high','critical');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  report_code text unique,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  category text not null check (category in ('road_damage','garbage','waterlogging','streetlight','other')),
  location_label text not null check (char_length(location_label) between 2 and 180),
  latitude double precision,
  longitude double precision,
  photo_path text,
  priority public.issue_priority not null default 'normal',
  priority_reason text not null default '',
  status public.issue_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_lat check (latitude is null or latitude between -90 and 90),
  constraint valid_lon check (longitude is null or longitude between -180 and 180)
);

create table if not exists public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  old_status public.issue_status,
  new_status public.issue_status not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists issues_created_at_idx on public.issues(created_at desc);
create index if not exists issues_status_priority_idx on public.issues(status, priority);
create index if not exists issues_location_idx on public.issues(latitude, longitude);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists issues_set_updated_at on public.issues;
create trigger issues_set_updated_at before update on public.issues
for each row execute function public.set_updated_at();

create or replace function public.make_report_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.report_code is null then
    new.report_code := 'CF-' || upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end; $$;
drop trigger if exists issues_make_report_code on public.issues;
create trigger issues_make_report_code before insert on public.issues
for each row execute function public.make_report_code();

create or replace function public.is_cityfix_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true);
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name)
  values(new.id, coalesce(new.raw_user_meta_data->>'name','CityFix Resident'))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created_cityfix on auth.users;
create trigger on_auth_user_created_cityfix after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.issues enable row level security;
alter table public.issue_events enable row level security;

drop policy if exists "profiles_read_self_or_admin" on public.profiles;
create policy "profiles_read_self_or_admin" on public.profiles
for select to authenticated using (auth.uid() = id or public.is_cityfix_admin());

drop policy if exists "issues_public_read" on public.issues;
create policy "issues_public_read" on public.issues
for select to anon, authenticated using (true);

drop policy if exists "issues_insert_own" on public.issues;
create policy "issues_insert_own" on public.issues
for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists "issues_admin_update" on public.issues;
create policy "issues_admin_update" on public.issues
for update to authenticated using (public.is_cityfix_admin())
with check (public.is_cityfix_admin());

drop policy if exists "events_read_authenticated" on public.issue_events;
create policy "events_read_authenticated" on public.issue_events
for select to authenticated using (true);

drop policy if exists "events_admin_insert" on public.issue_events;
create policy "events_admin_insert" on public.issue_events
for insert to authenticated with check (public.is_cityfix_admin());

grant select on public.issues to anon, authenticated;
grant insert on public.issues to authenticated;
grant update on public.issues to authenticated;
grant select on public.profiles to authenticated;
grant select on public.issue_events to authenticated;
grant insert on public.issue_events to authenticated;
grant execute on function public.is_cityfix_admin() to authenticated;

-- Private storage bucket. Uploaded photos are not publicly addressable.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values('issue-photos','issue-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "issue_photo_upload_own_folder" on storage.objects;
create policy "issue_photo_upload_own_folder" on storage.objects
for insert to authenticated with check (
  bucket_id = 'issue-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "issue_photo_read_own_or_admin" on storage.objects;
create policy "issue_photo_read_own_or_admin" on storage.objects
for select to authenticated using (
  bucket_id = 'issue-photos' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_cityfix_admin()
  )
);

-- IMPORTANT: after the first user signs in, promote the intended admin manually:
-- update public.profiles set is_admin = true where id = (select id from auth.users where email = 'YOUR_ADMIN_EMAIL');
-- Never expose the service_role key in browser code.
