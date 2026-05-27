-- Dialectica — Phase 2 schema (PRD §6.6, ROADMAP Phase 2)
-- Apply in Supabase Studio → SQL editor, or via `supabase db push` once a project link exists.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- users: app-level profile rows mirroring auth.users.
-- One row per signed-in user. id == auth.uid().
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text not null,
  role text not null default 'view' check (role in ('view', 'edit')),
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

-- Anyone signed in can read any user profile (we surface display names on stakes/annotations).
drop policy if exists "users: read all when signed in" on public.users;
create policy "users: read all when signed in"
  on public.users for select
  to authenticated
  using (true);

-- A user can update only their own profile (display_name; role is admin-only via service role).
drop policy if exists "users: update own row" on public.users;
create policy "users: update own row"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.users where id = auth.uid()));

-- New users get a row automatically when they sign up via Supabase Auth.
-- The seeded admin email mpholsch@media.mit.edu lands in role='edit'; everyone else 'view'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    case when new.email = 'mpholsch@media.mit.edu' then 'edit' else 'view' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- maps: the whole ArgMap stored as JSONB (PRD §6.2 — diffability).
-- ---------------------------------------------------------------------------
create table if not exists public.maps (
  id text primary key,
  owner_id uuid references public.users(id) on delete set null,
  title text not null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maps_updated_at_idx on public.maps (updated_at desc);

alter table public.maps enable row level security;

-- ---------------------------------------------------------------------------
-- map_access: per-map ACL for private maps.
-- Declared before the maps SELECT policy because that policy references it.
-- ---------------------------------------------------------------------------
create table if not exists public.map_access (
  map_id text not null references public.maps(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

-- Read: anyone signed in can read a map that is public OR that they have access to.
drop policy if exists "maps: read public or granted" on public.maps;
create policy "maps: read public or granted"
  on public.maps for select
  to authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or exists (
      select 1 from public.map_access ma
      where ma.map_id = public.maps.id and ma.user_id = auth.uid()
    )
  );

-- Write: only role='edit' users can insert/update/delete.
drop policy if exists "maps: insert by edit role" on public.maps;
create policy "maps: insert by edit role"
  on public.maps for insert
  to authenticated
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  );

drop policy if exists "maps: update by edit role" on public.maps;
create policy "maps: update by edit role"
  on public.maps for update
  to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  );

drop policy if exists "maps: delete by edit role" on public.maps;
create policy "maps: delete by edit role"
  on public.maps for delete
  to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  );

alter table public.map_access enable row level security;

-- IMPORTANT: keep this policy free of references to public.maps. The maps
-- SELECT policy already references map_access; adding the reverse direction
-- here creates a cycle that Postgres rejects with 42P17 (infinite recursion).
-- Owner-side reads of grants run through the service role or via the edit-role
-- manage policy below.
drop policy if exists "map_access: read own grants" on public.map_access;
create policy "map_access: read own grants"
  on public.map_access for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "map_access: edit role manages" on public.map_access;
create policy "map_access: edit role manages"
  on public.map_access for all
  to authenticated
  using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'edit')
  );
