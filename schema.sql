create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.interesting_places (
  id uuid primary key default gen_random_uuid(),
  name_ka text not null,
  name_en text,
  category text not null check (category in ('viewpoint','historic','fishing','camping','food','picnic','nature','waterfall','lake','monastery','castle','cave','museum','hotel','gas_station','rest_area','beach','winery')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  description text,
  image_url text,
  visit_duration_min integer not null default 45 check (visit_duration_min >= 0),
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists interesting_places_active_idx on public.interesting_places(active);
create index if not exists interesting_places_category_idx on public.interesting_places(category);

alter table public.admin_users enable row level security;
alter table public.interesting_places enable row level security;

drop policy if exists "public can read active places" on public.interesting_places;
create policy "public can read active places"
on public.interesting_places
for select
using (active = true);

drop policy if exists "admins can read all places" on public.interesting_places;
create policy "admins can read all places"
on public.interesting_places
for select
to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins can insert places" on public.interesting_places;
create policy "admins can insert places"
on public.interesting_places
for insert
to authenticated
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins can update places" on public.interesting_places;
create policy "admins can update places"
on public.interesting_places
for update
to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins can delete places" on public.interesting_places;
create policy "admins can delete places"
on public.interesting_places
for delete
to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "admins can see own admin row" on public.admin_users;
create policy "admins can see own admin row"
on public.admin_users
for select
to authenticated
using (user_id = auth.uid());


-- Run this migration once on existing databases created with an older category list.
alter table public.interesting_places drop constraint if exists interesting_places_category_check;
alter table public.interesting_places add constraint interesting_places_category_check
check (category in ('viewpoint','historic','fishing','camping','food','picnic','nature','waterfall','lake','monastery','castle','cave','museum','hotel','gas_station','rest_area','beach','winery'));
