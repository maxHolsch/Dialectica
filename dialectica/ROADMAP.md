# Dialectica — Implementation Roadmap (Phases 2–10)

> Source PRD: [`../Dialectica V6 PRD.md`](../Dialectica%20V6%20PRD.md) · Current state: [`documentation.md`](documentation.md) · Module ↔ PRD ID map: [`docs/module-map.md`](docs/module-map.md)

Phases 0 and 1 are shipped (project bootstrap + 3 pixel-perfect read-only views). Everything below is the remaining work, broken into self-contained modules that drop into the structure already in place. Order is roughly per PRD §14 "must ship before event," but each phase is independently sequenceable.

## Sequencing summary

| Phase | Name | PRD IDs | Blocks |
|------:|------|---------|--------|
| 2 | Supabase auth + persistence | `DIA-MAP-2/3`, `DIA-MODE-1/2`, `DIA-HOME-1` writes | nothing — purely additive |
| 3 | Edit-mode affordances on the 3 views | `DIA-MODE-2`, `DIA-VIEW-1/2` edit | requires Phase 2 (writes) |
| 4 | Claim staking + side panel | `DIA-CLAIM-1`, `DIA-VIEW-3.5` | requires Phase 2 (user identity), independent of Phase 3 |
| 5 | Annotation / drawing | `DIA-ANNO-1..4` | requires Phase 2 (realtime + identity) |
| 6 | Version control | `DIA-VER-1` | requires Phase 2 (event sink); design-once |
| 7 | AI generation + admin | `DIA-AI-1`, `DIA-AI-4` | requires Phase 2 (write maps), independent of 3–6 |
| 8 | Print + scan-in | `DIA-PRINT-1/2` | requires Phase 2 (read maps), independent of 3–7 |
| 9 | Heatmap iframe | `DIA-VIEW-3.7` | requires Phase 4 (entry point) |
| 10 | Theming / assets | `DIA-ASSET-1` | independent; cleanup pass |

## Phase 2 — Supabase auth + persistence

**Goal:** Replace the JSON fixture data layer with Supabase. Add auth-gated access. Make the homepage's create/rename/delete actually persist.

Implements: `DIA-MAP-2` (JSON as source of truth — now stored as JSON in Postgres), `DIA-MAP-3` (direct JSON interface — JSONB column editable from SQL/Studio), `DIA-MODE-1` and `DIA-MODE-2` role gates, `DIA-HOME-1` writes.

**Why first:** every other phase needs (a) authenticated users for attribution, (b) a write path. Doing this once means no other phase has to invent persistence.

**New deps:** `@supabase/supabase-js`, `@supabase/ssr`. Use the `vercel-plugin:auth` and `vercel-plugin:vercel-storage` skills before wiring.

**Schema (Supabase Postgres):**

```sql
-- Per PRD §6.6
create table users (
  id uuid primary key default auth.uid(),
  email text unique not null,
  display_name text not null,
  role text not null default 'view'  -- 'view' | 'edit'
);

-- Whole map stored as a single JSONB blob to preserve §6.2 diffability.
create table maps (
  id text primary key,
  owner_id uuid references users(id),
  title text not null,
  data jsonb not null,                -- the ArgMap shape from lib/schema/index.ts
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Visibility per Figma "Public" / "Private" pill.
create table map_access (
  map_id text references maps(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (map_id, user_id)
);
```

RLS policies: anyone signed in can read maps they have access to; only `role = 'edit'` users can update.

**Files touched / added:**

- `lib/supabase/client.ts`, `lib/supabase/server.ts` — typed clients per @supabase/ssr docs
- `lib/data/maps.ts` — swap fixture for `supabase.from('maps').select(...)`. Schema validation via the existing Zod `ArgMap.parse()` stays — it now validates DB rows
- `lib/data/users.ts` — `currentUser()`, `currentMode()`
- `proxy.ts` (Next.js 16 — not `middleware.ts`) — auth gate; unauthenticated → `/sign-in`
- `app/sign-in/page.tsx` — email + name signup per PRD §6.6 (no SSO)
- `components/homepage/NewMapButton.tsx` — wire to `INSERT into maps`; render only if `currentMode() === 'edit'`
- `components/homepage/MapCard.tsx` — add right-click menu with rename/delete (edit mode only)

**Acceptance:**

1. Signed-out user gets bounced to `/sign-in`.
2. Signed-in `view` user lands on homepage, sees only "Open" actions on cards. No NEW MAP button.
3. Signed-in `edit` user sees NEW MAP button; clicking creates a row in `maps` and routes to its crux view.
4. Reloading any page preserves auth state.
5. Phase 1 visuals are unchanged (the data swap is invisible).

**Risk:** RLS policies are easy to misconfigure. Add a Playwright smoke test that signs in as a view user and verifies attempted writes are 403.

## Phase 3 — Edit-mode affordances on the 3 views

**Goal:** Curators can edit cruxes / frames / nodes / edges directly on the canvas. Per PRD §5.1 edit-mode and §5.2 affordances.

Implements: `DIA-MODE-2`, `DIA-VIEW-1` edit, `DIA-VIEW-2` edit, `DIA-MAP-4` propagation (text edits to canonical nodes propagate to every frame instance).

**Figma reference:** node `12:127` for the edit toolbar.

**New components:**

- `components/canvas/EditToolbar.tsx` — floating bottom-center toolbar (replaces the disabled edit pencil in `CanvasShell`) with: select, add-node, add-edge, delete. Renders only when `currentMode() === 'edit'`.
- `components/canvas/EditableLabel.tsx` — double-click to enter contenteditable, click away to save. Used in all four node types.
- `lib/state/useDraftStore.ts` — Zustand store holding the in-progress edit (debounced flush to Supabase).
- `lib/data/mutations.ts` — `updateNodeText`, `addCrux`, `deleteCrux`, `moveNodeInstance`, `addEdge`, `deleteEdge`, etc. All write via `supabase.rpc(...)` or direct upserts and emit a row into the `events` table (Phase 6).

**Behavior changes in existing components:**

- [`CanvasShell.tsx`](components/canvas/CanvasShell.tsx) — when edit mode, pass `nodesDraggable={true}`, `nodesConnectable={true}`. Wire `onNodesChange`, `onEdgesChange`, `onConnect` to mutation calls. Persist position changes globally per §6.7.
- [`TopQuestionNode.tsx`](components/crux/TopQuestionNode.tsx) / [`CruxTileNode.tsx`](components/crux/CruxTileNode.tsx) / [`ClaimNode.tsx`](components/frame/ClaimNode.tsx) — wrap text in `EditableLabel`.

**Edge direction from drag (per PRD §5.1):** when user drags from tile A to tile B, edge direction defaults to A → B. Mark `undirected: true` only via a toolbar toggle.

**Acceptance:**

1. Edit-mode user double-clicks a crux text → contenteditable opens → typing updates the text in real time → clicking away saves and propagates to every frame instance.
2. Drag a crux tile → on release, position persists globally; other connected users see it move (Phase 5 realtime stretches here too).
3. Click "+ Add crux" in toolbar → new tile appears at viewport center; an associated empty `Frame` is created.
4. Right-click → Delete crux removes the tile, its frame, and any incident edges. Recorded in version history (Phase 6).
5. Pixel-stable for view-mode users (per PRD §6.7).

## Phase 4 — Claim staking + side panel

**Goal:** Participants can right-click a node and "I stand behind this." Clicking a node opens a side panel showing the stake count, list of stakers (names only in edit mode), and a stub "Where was this said?" button.

Implements: `DIA-CLAIM-1`, `DIA-VIEW-3.5`.

**Schema:**

```sql
create table stakes (
  id uuid primary key default gen_random_uuid(),
  map_id text references maps(id) on delete cascade,
  frame_id text not null,
  node_id text not null,
  user_id uuid references users(id),
  created_at timestamptz default now(),
  unique (map_id, frame_id, node_id, user_id)  -- one stake per user per frame instance
);
```

Stakes attach to the **frame instance** per PRD §6.4: `(map_id, frame_id, node_id)`.

**New components:**

- `components/frame/SidePanel.tsx` — slide-out panel anchored to right edge. Opens via React Flow `onNodeClick` (was a no-op in Phase 1). Shows the claim text, "I stand behind this" button, stake count, optional list of stakers.
- `components/frame/StakeButton.tsx` — toggles the current user's stake. Optimistic update.
- `components/frame/ContextMenu.tsx` — right-click handler on nodes; "I stand behind this" shortcut.
- `lib/state/useUIStore.ts` — adds `sidePanelNode: { frameId, nodeId } | null` and open/close actions.

**Attribution visibility (PRD §6.6):** the staker list reads `currentMode()` and shows names only in edit mode. Counts always visible.

**Acceptance:**

1. View-mode user right-clicks a claim → menu shows "I stand behind this" → clicking adds their stake → count increments.
2. Clicking the same claim again opens the side panel with the full text, stake count, and a "Where was this said?" button (stubbed → returns to canvas in Phase 4; routes to Phase 9 split view once that ships).
3. View-mode user sees count but not names; edit-mode user sees both.
4. One-stake-per-user enforced (unique constraint).

## Phase 5 — Annotation / drawing

**Goal:** Hand-drawn scribbles render over the canvas in real time, persistent across sessions, attributed per user.

Implements: `DIA-ANNO-1` tools (pencil / highlighter / marker / eraser / sticker), `DIA-ANNO-2` coordinate model, `DIA-ANNO-3` edit/move, `DIA-ANNO-4` realtime.

**Open question to settle first** (per PRD §9.1): survey `perfect-freehand` vs. a custom canvas implementation. Decision criterion: stroke rendering must keep up with pan/zoom without lag. **Recommended:** `perfect-freehand` for stroke geometry + a Konva or raw `<canvas>` layer for rendering. Rendering on `<svg>` may pile up paths and slow the canvas as strokes accumulate.

**Schema:**

```sql
create table annotations (
  id uuid primary key default gen_random_uuid(),
  map_id text references maps(id) on delete cascade,
  frame_id text not null,                -- which frame the stroke lives on (PRD §9.2)
  user_id uuid references users(id),
  tool text not null,                    -- pencil | highlighter | marker | eraser | sticker
  color text not null,
  size real not null,
  points jsonb not null,                 -- [{x,y,t,pressure}, ...]
  created_at timestamptz default now()
);
```

Strokes attach to `frame_id` (not to nodes — strokes are independent geometric objects per PRD §9.2).

**New components:**

- `components/canvas/AnnotationLayer.tsx` — `<canvas>` overlay on top of React Flow, transforms with the same viewport (subscribe to `useReactFlow().getViewport()`).
- `components/canvas/AnnotationToolbar.tsx` — tool picker (pencil/highlighter/marker/eraser/sticker), color picker, size slider.
- `lib/state/useStrokeStore.ts` — in-flight stroke during a draw gesture, flushed on pointer-up.
- `lib/realtime/annotations.ts` — Supabase Realtime channel per frame; broadcast strokes as they complete.

**Acceptance:**

1. Pencil tool draws textured strokes that follow the pointer with no perceptible delay during pan/zoom.
2. Stroke is visible to all connected users within ~200ms (Supabase Realtime).
3. Strokes are spatially independent of nodes: dragging a crux in edit mode does NOT move nearby strokes (per PRD §9.2 implication).
4. View-mode users can only edit/move/erase their own strokes; edit-mode users can edit any.

## Phase 6 — Version control

**Goal:** Every entry / edit / deletion / draw event recorded with enough fidelity to inspect via CLI. Per PRD §8.1.

Implements: `DIA-VER-1`. Branching deferred to a future extension.

**Decision settled:** in-house Postgres event log, not a real git repo. A git repo on a cloud VM creates ops overhead and doesn't add much over JSONB diffs.

**Schema:**

```sql
create table events (
  id bigserial primary key,
  map_id text references maps(id) on delete cascade,
  user_id uuid references users(id),
  kind text not null,        -- 'node.create' | 'node.edit' | 'node.delete' | 'edge.create' | ... | 'annotation.create' | 'stake.create' | ...
  payload jsonb not null,    -- diff or snapshot
  created_at timestamptz default now()
);

create index on events (map_id, created_at desc);
```

**New code:**

- `lib/version/log.ts` — `recordEvent(kind, payload)`. Called from every mutation in `lib/data/mutations.ts`, every stroke flush, every stake.
- `scripts/inspect-history.ts` — Node CLI: `pnpm tsx scripts/inspect-history.ts <map-id>` prints events newest-first with optional `--filter kind=*` and `--since <iso>`.
- `scripts/replay.ts` — rebuild a map's JSONB from the event log up to a given timestamp (sanity check + future branching foundation).

**Acceptance:**

1. Editing a node text writes a `node.edit` event with `{ nodeId, before, after }`.
2. CLI prints history for any map in a readable form.
3. Replay script reproduces the current map state from event log alone (matches `maps.data` byte-for-byte under stable key ordering).

## Phase 7 — AI generation + admin

**Goal:** Produce maps from source material (docs, transcripts, audio) via an encapsulated pipeline. Admin page to oversee runs.

Implements: `DIA-AI-1`, `DIA-AI-4`.

**Use the workflow skill (`vercel-plugin:workflow`) here.** Generation is a long-running multi-step task that benefits from durable execution: AssemblyAI transcription (minutes) → prompt pipeline (seconds) → JSON synthesis (seconds) → DB write. Crash mid-run → resume from last completed step.

**New code:**

- `lib/ai/pipeline.ts` — the pipeline itself, encapsulated. Single export: `generateMap({ inputs, params })` returns a populated `ArgMap`.
- `lib/ai/assemblyai.ts` — audio (`.m4a`) → transcript via AssemblyAI.
- `lib/ai/prompts/` — versioned prompt templates (tunable copy style, frame structure, number of maps).
- `app/api/generations/route.ts` — POST creates a Vercel Workflow run. GET lists runs.
- `app/admin/page.tsx` — DIA-AI-4 admin UI: list runs, view inputs/outputs, re-run with adjusted params. Gated on `role = 'edit'`.
- `app/admin/runs/[runId]/page.tsx` — single-run detail with step status, transcripts, generated JSON preview.

**Failure modes (per PRD §7.1):** bad audio, partial transcription. Surface them on the run's admin page with clear error text and a "re-run from step N" button.

**Acceptance:**

1. Admin uploads an `.m4a` → workflow starts → admin sees AssemblyAI transcript when it completes.
2. Generated map appears in the homepage grid, openable in crux view, with the right structure.
3. Re-running a generation with edited prompt params produces a different output, both versions visible in admin history.
4. A crashed function instance does not lose run state — pipeline resumes on next invocation.

## Phase 8 — Print + scan-in

**Goal:** Generate a printable booklet of any map (page 1 = crux map, subsequent pages = one per crux+frame); upload phone photos of marked-up pages back as annotation strokes.

Implements: `DIA-PRINT-1`, `DIA-PRINT-2`.

**Figma reference:** the print sidebar UI is at node `10:14`.

**Print route (server-rendered):**

- `app/print/[mapId]/page.tsx` — print-stylesheet-friendly layout. Each page is a `<section>` with `page-break-after: always`. Server-side rendered using the same `CruxCanvas` / `FrameCanvas` components but inside a fixed-dimension container (no pan/zoom, fitView).
- `lib/print/pdf.ts` — server-side PDF generation via Puppeteer / `@vercel/og` / similar. Returns a PDF blob.
- `app/api/print/[mapId]/route.ts` — GET returns the PDF. Two variants per PRD §11.1: `?annotations=baked` (current annotations included) vs `?annotations=clean`.

**Scan route (mobile-web, intentionally apart from main app):**

- `app/scan/page.tsx` — minimalist mobile UI with file input for photos and a frame picker.
- `app/api/scan/route.ts` — POST receives photo + `(mapId, frameId)`. Server-side:
  1. Detect page registration marks (or alignment from layout) to map photo coords → frame coords.
  2. Image diff against the original frame layout (Phase 8.1 ships with: registration-by-corner-markers + threshold diff).
  3. Vectorize delta → emit annotation strokes via the Phase 5 schema.

**Why this works (per PRD §11.2):** node positions are immutable in view mode (§6.7) so the printed page and the digital frame share a stable coordinate system across an event.

**Acceptance:**

1. Print a map: PDF has page 1 = crux map, then 1 page per crux+frame. Both variants generate correctly.
2. Scan a booklet page: visible scribbles on the printed page appear within ~10 seconds as annotation strokes on the corresponding digital frame.
3. Repeated uploads of the same page do not duplicate strokes (idempotency via photo content hash or upload session id).

## Phase 9 — Heatmap iframe (DIA-VIEW-3.7)

**Goal:** Side-by-side split view triggered by "Where was this said?" in Phase 4's side panel. Heatmap is an external tool surfaced as an iframe.

**New components:**

- `components/frame/HeatmapPanel.tsx` — iframe wrapped in a resizable splitter (Dialectica left, heatmap right). Splitter constrained to 15% ↔ 85% per PRD §5.4. Use `react-resizable-panels`.
- `lib/heatmap.ts` — URL builder per node: `heatmapUrl(claimText)`. Per PRD §5.4 this is a "pre-run all prompts for each claim" model — until the heatmap tool exposes a real API, fall back to a grey-box `<div>` matching the iframe's intended size.

**State:** Phase 4's side panel passes the active claim. Clicking "Where was this said?" sets `useUIStore.heatmapClaim = { frameId, nodeId }`; the FramePage layout then renders `HeatmapPanel` instead of full-width `FrameCanvas`.

**Acceptance:**

1. From a claim's side panel, clicking "Where was this said?" splits the view: Dialectica takes 25%, heatmap iframe takes 75%.
2. Dragging the splitter resizes both panes, clamped to 15%/85%.
3. Closing the heatmap returns to full-width frame view.
4. When the heatmap tool isn't reachable, the right pane shows a clearly-labeled grey placeholder instead of a broken iframe.

## Phase 10 — Theming / assets

**Goal:** All visual assets in one swappable folder. Documentation describing how to reskin.

Implements: `DIA-ASSET-1`.

**Restructure:**

```
assets/
  tokens/
    colors.ts            # exports the Dialectica palette as TS constants
    typography.ts        # font stacks and scale
    radii.ts             # radius tokens
  icons/
    edit-pencil.svg
    search.svg
    ...                  # all lucide-react replacements + custom icons
  stickers/
    great-point.svg
    ...                  # Phase 5 sticker assets
  fonts/
    README.md            # which fonts and where they're loaded from
  themes/
    default/theme.json   # token overrides for default skin
    high-contrast/theme.json
```

**Token loader:** `app/globals.css` reads tokens from `assets/themes/<active>/theme.json` at build time via a small Vite/PostCSS plugin or a generated CSS file. Swapping `active` cascades to all components.

**Docs:** `assets/README.md` explaining:
1. How tokens get from `theme.json` into Tailwind classes
2. How to add a new theme
3. Icon naming convention and how to add one
4. Sticker authoring guidelines (size, padding, color)

**Acceptance:** changing `active` from `default` to a new theme propagates through the homepage, both canvas views, and all UI chrome without code edits.

## Deferred (post-event)

Per PRD §14 and §16, these wait until participant feedback from the first event:

- `DIA-VIEW-3` Node view
- `DIA-VER-2` Session-level change characterization
- `DIA-VER-3` Annotation history as first-class
- `DIA-AI-2` Agent-readable maps
- `DIA-AI-3` Tunable copy parameters
- `DIA-FEED-1` Feedback loop on AI output
- Branching version control (Phase 6 extension)
- Sticker tool polish (Phase 5 extension)
