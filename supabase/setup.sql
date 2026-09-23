-- ShribeTRAKR schema. Run this in a new Supabase project, not the sports app.
-- Dashboard → SQL Editor → New query → paste this whole file → Run.
-- Safe to run more than once.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Athlete',
  username text not null unique,
  bio text,
  avatar_color text not null default '#6366f1',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  is_global smallint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.workout_plans(id) on delete cascade,
  name text not null,
  section text not null default 'Workout',
  order_index integer not null default 0,
  notes text
);

create table if not exists public.schedule_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date text not null,
  plan_id bigint not null references public.workout_plans(id) on delete cascade,
  notes text,
  unique (user_id, date, plan_id)
);

create table if not exists public.workout_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  schedule_entry_id bigint references public.schedule_entries(id) on delete set null,
  plan_id bigint not null references public.workout_plans(id),
  date text not null,
  notes text,
  completed_at timestamptz
);

create table if not exists public.set_logs (
  id bigint generated always as identity primary key,
  session_id bigint not null references public.workout_sessions(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id),
  set_number integer not null,
  reps integer,
  weight double precision,
  unit text not null default 'lbs',
  notes text
);

create table if not exists public.activity_types (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '🏃',
  metric_label text,
  show_duration smallint not null default 1,
  has_location smallint not null default 0,
  sort_order integer not null default 0
);

create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type_id bigint not null references public.activity_types(id),
  date text not null,
  duration_mins integer,
  metric_value text,
  location text,
  notes text,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.scheduled_activities (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type_id bigint not null references public.activity_types(id),
  date text not null,
  notes text,
  unique (user_id, date, activity_type_id)
);

create table if not exists public.recovery_days (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  date text not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.follows (
  id bigint generated always as identity primary key,
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id)
);

create table if not exists public.plan_shares (
  id bigint generated always as identity primary key,
  plan_id bigint not null references public.workout_plans(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  accepted smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (plan_id, to_user_id)
);

create table if not exists public.whoop_tokens (
  id bigint generated always as identity primary key,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at bigint not null,
  whoop_user_id text,
  created_at timestamptz not null default now()
);

insert into public.activity_types (user_id, name, emoji, metric_label, show_duration, has_location, sort_order)
select null, v.name, v.emoji, v.metric_label, v.show_duration, v.has_location, v.sort_order
from (values
  ('Golf Round', '⛳', 'Score', 0, 1, 0),
  ('Golf Practice', '🏌️', null, 1, 1, 1),
  ('Tennis', '🎾', null, 1, 0, 2),
  ('Pickleball', '🏓', null, 1, 0, 3),
  ('Baseball Catch', '⚾', null, 1, 0, 4),
  ('Running', '🏃', null, 1, 0, 5),
  ('Cycling', '🚴', null, 1, 0, 6),
  ('Swimming', '🏊', null, 1, 0, 7),
  ('Yoga', '🧘', null, 1, 0, 8),
  ('Hiking', '🥾', null, 1, 0, 9)
) as v(name, emoji, metric_label, show_duration, has_location, sort_order)
where not exists (
  select 1 from public.activity_types t where t.user_id is null and t.name = v.name
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  uname text;
  display_name text;
begin
  display_name := coalesce(nullif(new.raw_user_meta_data->>'name', ''), split_part(new.email, '@', 1), 'Athlete');
  base := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));
  if base is null or base = '' then
    base := 'athlete';
  end if;
  uname := base;
  while exists (select 1 from public.profiles where username = uname) loop
    uname := base || floor(random() * 10000)::text;
  end loop;
  insert into public.profiles (id, name, username)
  values (new.id, display_name, uname)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.workout_plans enable row level security;
alter table public.exercises enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.set_logs enable row level security;
alter table public.activity_types enable row level security;
alter table public.activity_logs enable row level security;
alter table public.scheduled_activities enable row level security;
alter table public.recovery_days enable row level security;
alter table public.follows enable row level security;
alter table public.plan_shares enable row level security;
alter table public.whoop_tokens enable row level security;

grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

drop policy if exists plans_select on public.workout_plans;
create policy plans_select on public.workout_plans for select to authenticated
  using (user_id = auth.uid() or is_global = 1);
drop policy if exists plans_insert on public.workout_plans;
create policy plans_insert on public.workout_plans for insert to authenticated with check (user_id = auth.uid());
drop policy if exists plans_update on public.workout_plans;
create policy plans_update on public.workout_plans for update to authenticated using (user_id = auth.uid());
drop policy if exists plans_delete on public.workout_plans;
create policy plans_delete on public.workout_plans for delete to authenticated using (user_id = auth.uid());

drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (exists (
    select 1 from public.workout_plans p
    where p.id = exercises.plan_id and (p.user_id = auth.uid() or p.is_global = 1)
  ));
drop policy if exists exercises_write on public.exercises;
create policy exercises_write on public.exercises for all to authenticated
  using (exists (select 1 from public.workout_plans p where p.id = exercises.plan_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_plans p where p.id = exercises.plan_id and p.user_id = auth.uid()));

drop policy if exists schedule_all on public.schedule_entries;
create policy schedule_all on public.schedule_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sessions_select on public.workout_sessions;
create policy sessions_select on public.workout_sessions for select to authenticated
  using (user_id = auth.uid() or completed_at is not null);
drop policy if exists sessions_write on public.workout_sessions;
create policy sessions_write on public.workout_sessions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sessions_update on public.workout_sessions;
create policy sessions_update on public.workout_sessions for update to authenticated using (user_id = auth.uid());
drop policy if exists sessions_delete on public.workout_sessions;
create policy sessions_delete on public.workout_sessions for delete to authenticated using (user_id = auth.uid());

drop policy if exists sets_select on public.set_logs;
create policy sets_select on public.set_logs for select to authenticated
  using (exists (
    select 1 from public.workout_sessions s
    where s.id = set_logs.session_id and (s.user_id = auth.uid() or s.completed_at is not null)
  ));
drop policy if exists sets_write on public.set_logs;
create policy sets_write on public.set_logs for all to authenticated
  using (exists (select 1 from public.workout_sessions s where s.id = set_logs.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions s where s.id = set_logs.session_id and s.user_id = auth.uid()));

drop policy if exists activity_types_select on public.activity_types;
create policy activity_types_select on public.activity_types for select to authenticated
  using (user_id is null or user_id = auth.uid());
drop policy if exists activity_types_insert on public.activity_types;
create policy activity_types_insert on public.activity_types for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists activity_types_delete on public.activity_types;
create policy activity_types_delete on public.activity_types for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists activity_logs_all on public.activity_logs;
create policy activity_logs_all on public.activity_logs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists scheduled_activities_all on public.scheduled_activities;
create policy scheduled_activities_all on public.scheduled_activities for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists recovery_all on public.recovery_days;
create policy recovery_all on public.recovery_days for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows for select to authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

drop policy if exists shares_select on public.plan_shares;
create policy shares_select on public.plan_shares for select to authenticated
  using (from_user_id = auth.uid() or to_user_id = auth.uid());
drop policy if exists shares_insert on public.plan_shares;
create policy shares_insert on public.plan_shares for insert to authenticated with check (from_user_id = auth.uid());
drop policy if exists shares_update on public.plan_shares;
create policy shares_update on public.plan_shares for update to authenticated using (to_user_id = auth.uid());
drop policy if exists shares_delete on public.plan_shares;
create policy shares_delete on public.plan_shares for delete to authenticated using (to_user_id = auth.uid());

drop policy if exists whoop_all on public.whoop_tokens;
create policy whoop_all on public.whoop_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars public read" on storage.objects;
create policy "avatars public read" on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists "avatars owner insert" on storage.objects;
create policy "avatars owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars owner update" on storage.objects;
create policy "avatars owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars owner delete" on storage.objects;
create policy "avatars owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
