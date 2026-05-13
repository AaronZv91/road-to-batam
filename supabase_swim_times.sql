-- Run in Supabase SQL editor (once) for 50m stroke leaderboards + trending.
-- Your `swimmers.id` is bigint — `swimmer_id` must match.

-- If a failed attempt left a wrong-typed table, uncomment then run once:
-- drop table if exists public.swim_times;

create table if not exists public.swim_times (
  id uuid primary key default gen_random_uuid(),
  swimmer_id bigint not null references public.swimmers (id) on delete cascade,
  stroke text not null check (stroke in ('freestyle', 'breaststroke')),
  distance_m int not null default 50 check (distance_m = 50),
  time_sec numeric not null check (time_sec > 0),
  created_at timestamptz not null default now()
);

create index if not exists swim_times_stroke_created on public.swim_times (stroke, created_at desc);
create index if not exists swim_times_stroke_swimmer on public.swim_times (stroke, swimmer_id);

-- Enable Realtime for `swim_times` in Supabase Dashboard: Database → Replication

-- ---------------------------------------------------------------------------
-- RLS: if leaderboards stay empty, the anon key is usually blocked here.
-- Run this AFTER `swim_times` exists (safe to re-run).
-- ---------------------------------------------------------------------------
alter table public.swim_times enable row level security;

drop policy if exists "swim_times_select_public" on public.swim_times;
create policy "swim_times_select_public"
  on public.swim_times
  for select
  to anon, authenticated
  using (true);

drop policy if exists "swim_times_insert_public" on public.swim_times;
create policy "swim_times_insert_public"
  on public.swim_times
  for insert
  to anon, authenticated
  with check (true);
