-- Dialectica — schema for hosted Supabase project (Phases 2 + 4 + 5).
-- Apply via Supabase Studio → SQL editor on https://supabase.com/dashboard.
-- Idempotent: safe to re-run.
--
-- All tables use the `Dialectica_` prefix (mixed-case), so every identifier is
-- double-quoted. The Supabase JS client must reference them by exact string,
-- e.g. supabase.from('Dialectica_users').

-- ---------------------------------------------------------------------------
-- Dialectica_users: app-level profile rows mirroring auth.users.
-- One row per signed-in user. id == auth.uid().
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_users" (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text not null,
  role text not null default 'view' check (role in ('view', 'edit')),
  created_at timestamptz not null default now()
);

alter table public."Dialectica_users" enable row level security;

drop policy if exists "users: read all when signed in" on public."Dialectica_users";
create policy "users: read all when signed in"
  on public."Dialectica_users" for select
  to authenticated
  using (true);

drop policy if exists "users: update own row" on public."Dialectica_users";
create policy "users: update own row"
  on public."Dialectica_users" for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public."Dialectica_users" where id = auth.uid()));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public."Dialectica_users" (id, email, display_name, role)
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
-- Dialectica_maps: ArgMap stored as JSONB (PRD §6.2 — diffability).
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_maps" (
  id text primary key,
  owner_id uuid references public."Dialectica_users"(id) on delete set null,
  title text not null,
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists "Dialectica_maps_updated_at_idx"
  on public."Dialectica_maps" (updated_at desc);

alter table public."Dialectica_maps" enable row level security;

-- ---------------------------------------------------------------------------
-- Dialectica_map_access: per-map ACL for private maps.
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_map_access" (
  map_id text not null references public."Dialectica_maps"(id) on delete cascade,
  user_id uuid not null references public."Dialectica_users"(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (map_id, user_id)
);

drop policy if exists "maps: read public or granted" on public."Dialectica_maps";
create policy "maps: read public or granted"
  on public."Dialectica_maps" for select
  to authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or exists (
      select 1 from public."Dialectica_map_access" ma
      where ma.map_id = public."Dialectica_maps".id and ma.user_id = auth.uid()
    )
  );

drop policy if exists "maps: insert by edit role" on public."Dialectica_maps";
create policy "maps: insert by edit role"
  on public."Dialectica_maps" for insert
  to authenticated
  with check (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

drop policy if exists "maps: update by edit role" on public."Dialectica_maps";
create policy "maps: update by edit role"
  on public."Dialectica_maps" for update
  to authenticated
  using (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

drop policy if exists "maps: delete by edit role" on public."Dialectica_maps";
create policy "maps: delete by edit role"
  on public."Dialectica_maps" for delete
  to authenticated
  using (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

alter table public."Dialectica_map_access" enable row level security;

drop policy if exists "map_access: read own grants" on public."Dialectica_map_access";
create policy "map_access: read own grants"
  on public."Dialectica_map_access" for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "map_access: edit role manages" on public."Dialectica_map_access";
create policy "map_access: edit role manages"
  on public."Dialectica_map_access" for all
  to authenticated
  using (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

-- ---------------------------------------------------------------------------
-- Dialectica_stakes: PRD §10.1 / DIA-CLAIM-1.
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_stakes" (
  id uuid primary key default gen_random_uuid(),
  map_id text not null references public."Dialectica_maps"(id) on delete cascade,
  frame_id text not null,
  node_id text not null,
  user_id uuid not null references public."Dialectica_users"(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (map_id, frame_id, node_id, user_id)
);

create index if not exists "Dialectica_stakes_map_id_idx"
  on public."Dialectica_stakes" (map_id);
create index if not exists "Dialectica_stakes_frame_node_idx"
  on public."Dialectica_stakes" (map_id, frame_id, node_id);

alter table public."Dialectica_stakes" enable row level security;

drop policy if exists "stakes: read when signed in" on public."Dialectica_stakes";
create policy "stakes: read when signed in"
  on public."Dialectica_stakes" for select
  to authenticated
  using (
    exists (select 1 from public."Dialectica_maps" m where m.id = public."Dialectica_stakes".map_id)
  );

drop policy if exists "stakes: insert own" on public."Dialectica_stakes";
create policy "stakes: insert own"
  on public."Dialectica_stakes" for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "stakes: delete own" on public."Dialectica_stakes";
create policy "stakes: delete own"
  on public."Dialectica_stakes" for delete
  to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Dialectica_annotations: Phase 5 / DIA-ANNO-4.
-- One row per stroke or text-box. Points stored relative to bounding-box origin.
-- frame_id is nullable: crux-view scribbles aren't tied to a frame.
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_annotations" (
  -- App-generated slug IDs (e.g. "ann-quparf-mpuj9jy9") — matches the convention
  -- used by Dialectica_maps.id and frame/node IDs. Not a uuid.
  id text primary key,
  map_id text not null references public."Dialectica_maps"(id) on delete cascade,
  frame_id text,
  user_id uuid references public."Dialectica_users"(id) on delete set null,
  tool text not null check (tool in ('pencil', 'pen', 'highlighter', 'textbox', 'marker', 'eraser', 'sticker')),
  color text not null,
  size real not null,
  origin jsonb not null,
  width real not null,
  height real not null,
  points jsonb not null,
  text text,
  created_at timestamptz not null default now()
);

create index if not exists "Dialectica_annotations_map_frame_idx"
  on public."Dialectica_annotations" (map_id, frame_id);
create index if not exists "Dialectica_annotations_user_idx"
  on public."Dialectica_annotations" (user_id);

alter table public."Dialectica_annotations" enable row level security;

-- Read: anyone who can read the underlying map sees its annotations.
drop policy if exists "annotations: read when map visible" on public."Dialectica_annotations";
create policy "annotations: read when map visible"
  on public."Dialectica_annotations" for select
  to authenticated
  using (
    exists (select 1 from public."Dialectica_maps" m where m.id = public."Dialectica_annotations".map_id)
  );

-- Insert: anyone signed in can add a stroke they own (view users participate per §9.1).
drop policy if exists "annotations: insert own" on public."Dialectica_annotations";
create policy "annotations: insert own"
  on public."Dialectica_annotations" for insert
  to authenticated
  with check (user_id = auth.uid());

-- Update: own stroke (e.g. drag-move) OR edit-role user (curators tidy any stroke).
drop policy if exists "annotations: update own or edit role" on public."Dialectica_annotations";
create policy "annotations: update own or edit role"
  on public."Dialectica_annotations" for update
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    user_id = auth.uid()
    or exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

-- Delete: own stroke OR edit-role user (PRD §9.1 — view users can erase only their own).
drop policy if exists "annotations: delete own or edit role" on public."Dialectica_annotations";
create policy "annotations: delete own or edit role"
  on public."Dialectica_annotations" for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

-- Realtime: broadcast inserts/updates/deletes to subscribed clients (~200ms per PRD §9.3).
-- Supabase ships with a `supabase_realtime` publication; we add our table to it.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'Dialectica_annotations'
  ) then
    alter publication supabase_realtime add table public."Dialectica_annotations";
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Dialectica_generations: Phase 7 / DIA-AI-1. One row per generation run.
-- A run starts when the admin uploads source material; the Vercel Workflow
-- driving the pipeline writes back status + per-stage blob URLs as it
-- progresses. Intermediate JSONs live in Vercel Blob (one file per stage), not
-- in this table — the row just records pointers so the admin UI can fetch them.
-- ---------------------------------------------------------------------------
create table if not exists public."Dialectica_generations" (
  id text primary key,
  workflow_run_id text,
  created_by uuid references public."Dialectica_users"(id) on delete set null,
  source_kind text not null check (source_kind in ('text', 'audio')),
  source_label text,
  params jsonb not null,
  status text not null default 'queued' check (
    status in ('queued', 'transcribing', 'extracting', 'distilling', 'organizing', 'relating', 'fact_checking', 'quoting', 'mapping', 'succeeded', 'failed')
  ),
  error text,
  -- Storage paths inside the private `dialectica_generations` bucket. Signed
  -- URLs are minted on demand server-side; nothing client-visible is stored.
  transcript_path text,
  raw_claims_path text,
  distilled_path text,
  questions_path text,
  relations_path text,
  fact_check_path text,
  quotes_path text,
  -- Per-stage + total token usage and running USD cost. Written by the
  -- workflow after each stage; rendered as the "Cost so far" tally in admin.
  -- Shape: { model, perStage: { extract: StageUsage, ... }, total: StageUsage, totalUsd: number }
  usage jsonb,
  map_id text references public."Dialectica_maps"(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent migrations for projects that created `Dialectica_generations`
-- before the column rename (`*_url` → `*_path`) and before the usage column
-- existed. Safe to leave in place — `add column if not exists` is a no-op on
-- columns that already exist.
alter table public."Dialectica_generations"
  add column if not exists transcript_path text,
  add column if not exists raw_claims_path text,
  add column if not exists distilled_path text,
  add column if not exists questions_path text,
  add column if not exists relations_path text,
  add column if not exists fact_check_path text,
  add column if not exists usage jsonb,
  add column if not exists quotes_path text,
  -- Needed so restart can reuse the original framing without re-asking.
  add column if not exists title text,
  add column if not exists top_question text,
  -- Activity log. Append-only array of { at, stage, message }. Renders as a
  -- collapsible timeline on the admin run page; each stage's most recent
  -- entry also shows as the "how far along" line on the stage grid card.
  add column if not exists log jsonb not null default '[]'::jsonb;

-- Add 'quoting' to the status check constraint (Stage 5 quote-retrieval step).
-- Drop the auto-named constraint and replace it with the expanded set.
-- The constraint name is auto-generated by Postgres as
-- `Dialectica_generations_status_check` when no explicit name is given.
alter table public."Dialectica_generations"
  drop constraint if exists "Dialectica_generations_status_check";
alter table public."Dialectica_generations"
  add constraint "Dialectica_generations_status_check"
  check (status in ('queued', 'transcribing', 'extracting', 'distilling', 'organizing', 'relating', 'fact_checking', 'quoting', 'mapping', 'succeeded', 'failed'));

create index if not exists "Dialectica_generations_created_at_idx"
  on public."Dialectica_generations" (created_at desc);
create index if not exists "Dialectica_generations_status_idx"
  on public."Dialectica_generations" (status);

alter table public."Dialectica_generations" enable row level security;

-- Read: edit-role users see all runs (DIA-AI-4 admin is edit-gated).
drop policy if exists "generations: read by edit role" on public."Dialectica_generations";
create policy "generations: read by edit role"
  on public."Dialectica_generations" for select
  to authenticated
  using (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );

-- Write: edit-role only. The workflow runs server-side with the service-role
-- key, so it bypasses RLS anyway; this policy guards the admin UI's actions.
drop policy if exists "generations: write by edit role" on public."Dialectica_generations";
create policy "generations: write by edit role"
  on public."Dialectica_generations" for all
  to authenticated
  using (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  )
  with check (
    exists (select 1 from public."Dialectica_users" u where u.id = auth.uid() and u.role = 'edit')
  );
