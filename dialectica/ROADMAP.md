# Dialectica — Implementation Roadmap (Phases 2–10)

> Source PRD: [`../Dialectica V6 PRD.md`](../Dialectica%20V6%20PRD.md) · Current state: [`documentation.md`](documentation.md) · Module ↔ PRD ID map: [`docs/module-map.md`](docs/module-map.md)

Phases 0, 1, and 2 are shipped (project bootstrap + 3 pixel-perfect read-only views + Supabase auth/persistence). Everything below is the remaining work, broken into self-contained modules that drop into the structure already in place. Order is roughly per PRD §14 "must ship before event," but each phase is independently sequenceable.

## Sequencing summary

| Phase | Name | PRD IDs | Blocks |
|------:|------|---------|--------|
| 2 | Supabase auth + persistence | `DIA-MAP-2/3`, `DIA-MODE-1/2`, `DIA-HOME-1` writes | nothing — purely additive |
| 3 | Edit-mode affordances + freehand scribbling | `DIA-MODE-2`, `DIA-VIEW-1/2` edit, `DIA-ANNO-1..3` (single-user) | requires Phase 2 (writes) |
| 4 | Claim staking + side panel | `DIA-CLAIM-1`, `DIA-VIEW-3.5` | requires Phase 2 (user identity), independent of Phase 3 |
| 5 | Annotation realtime + multi-user | `DIA-ANNO-4`, sticker/marker | requires Phase 3 (drawing UI) + Phase 2 (realtime + identity) |
| 6 | Version control | `DIA-VER-1` | requires Phase 2 (event sink); design-once |
| 7 | AI generation + admin | `DIA-AI-1`, `DIA-AI-4` | requires Phase 2 (write maps), independent of 3–6 |
| 8 | Print + scan-in | `DIA-PRINT-1/2` | requires Phase 2 (read maps), independent of 3–7 |
| 9 | Heatmap iframe | `DIA-VIEW-3.7` | requires Phase 4 (entry point) |
| 10 | Theming / assets | `DIA-ASSET-1` | independent; cleanup pass |

## Phase 2 — Supabase auth + persistence ✅ shipped

**Goal:** Replace the JSON fixture data layer with Supabase. Add auth-gated access. Make the homepage's create/rename/delete actually persist.

**Setup checklist for a new clone** (also in [`documentation.md`](documentation.md)):

1. Local: ensure `supabase start` is running (containers `supabase_*_app` on ports 54321–54324); `.env.local` is already populated with the well-known local keys
2. Apply [`db/schema.sql`](db/schema.sql) (via Studio at http://127.0.0.1:54323 or `docker exec ... psql -f ...`)
3. Seed: `pnpm db:seed`
4. Magic-link emails land in Inbucket at http://127.0.0.1:54324

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

## Phase 3 — Edit-mode affordances + freehand scribbling

**Goal:** Curators edit cruxes / frames / nodes / edges, and any signed-in user can scribble on the canvas with pencil / pen / highlighter / text-box. Per PRD §5.1, §5.2, §9.1, §9.2.

Implements: `DIA-MODE-2`, `DIA-VIEW-1` edit, `DIA-VIEW-2` edit, `DIA-MAP-4` propagation, `DIA-ANNO-1` tools (single-user subset), `DIA-ANNO-2` coordinate model, `DIA-ANNO-3` edit/move.

**Figma references:** edit toolbar `12:127`, view toolbar `5:48`. The two pills share the same drawing tools — edit mode adds the dashed `+ ADD CLAIM` pill and a fifth (white) color swatch.

**Architecture decision settled:** strokes are stored as React Flow custom nodes (the canonical Steve Ruiz / official R-F Pro pattern). Stroke geometry comes from `perfect-freehand`. Rendering is `<svg><path/></svg>` per stroke — Phase 5 will migrate to a `<canvas>` overlay only if SVG-per-node degrades past ~hundreds of strokes during pan/zoom.

**New deps:** [`perfect-freehand`](https://github.com/steveruizok/perfect-freehand).

**Schema additions (no DB migration):**

- `lib/schema/index.ts` — `Annotation` extended with `origin: Position`, `width`, `height`, optional `text` (for text-box tool), and `frameId` made optional (crux-view scribbles have no frame). `AnnotationTool` extended with `pen` and `textbox` values. `ArgMap.annotations: Annotation[]` added so strokes persist inside the existing JSONB blob. Phase 5 will migrate to a dedicated `annotations` table.

**New components / modules:**

- `components/canvas/EditToolbar.tsx` — floating bottom-center pill matching Figma `12:127` / `5:48`. Tools: pencil, pen, highlighter, text-box, eraser. Mode glyphs: ✥ (select) / ✎ (draw) / ● (current color). Pastel swatches: mint / pink / blue / lavender (+ white in edit mode). Undo/redo buttons. `+ ADD CLAIM` pill in edit mode.
- `components/canvas/StrokeNode.tsx` — React Flow custom node. Renders one `Annotation` as an SVG path (freehand) or an editable text div (text-box). Bounding-box hit-test is "good enough" for Phase 3 eraser; precise polygon hit-test is a Phase 5 polish item.
- `components/canvas/InFlightStrokeLayer.tsx` — viewport-transformed overlay that renders the current gesture preview during a pointer-down → pointer-up cycle (before commit).
- `lib/state/useUIStore.ts` — Zustand store: `{ mode: 'select' | 'draw' | 'erase', tool, color, inFlightPoints, optimisticAdds, optimisticDeletes, history, cursor }`. Session-local undo/redo.
- `lib/canvas/freehand.ts` — `getSvgPathFromStroke`, per-tool `TOOL_PRESETS` for `getStroke` (pencil: thin opaque; pen: thick opaque; highlighter: broad with `fillOpacity: 0.35`), bounding-box helper.
- `lib/canvas/useDrawingHandlers.ts` — hook returning `{ onPointerDown, onPointerMove, onPointerUp, onPaneClick, eraseAnnotation }`. Converts screen → flow coords via `useReactFlow().screenToFlowPosition`, captures pressure (`e.pressure || 0.5`), stores points relative to bounding-box origin on commit.
- `lib/data/mutations.ts` — adds `createAnnotation(mapId, annotation)` and `deleteAnnotation(mapId, annotationId)`. Reads + writes the `maps.data` JSONB blob. Idempotent (replace-if-exists) so undo→redo round-trips cleanly.

**Behavior changes:**

- [`CanvasShell.tsx`](components/canvas/CanvasShell.tsx) — wraps `<ReactFlow>` in a div that owns pointer events. `panOnDrag={mode !== 'draw'}` prevents pan competing with the draw gesture. Merges server `map.annotations` with optimistic adds/deletes from `useUIStore`; promotes each to a `stroke`-type node. Eraser mode: `onNodeClick` checks `node.type === 'stroke'` and calls `eraseAnnotation`.
- Edit-mode-only node/edge affordances (editable text, drag, add/delete crux) — `components/canvas/EditableLabel.tsx`, `useDraftStore.ts`, `updateNodeText`, `addCrux`, `deleteCrux`, etc. — remain as previously scoped; the `+ ADD CLAIM` pill in `EditToolbar` is the entry point.

**Edge direction from drag (per PRD §5.1):** when user drags from tile A to tile B, edge direction defaults to A → B. Mark `undirected: true` only via a toolbar toggle.

**Pointer-event ownership:** don't attach drawing handlers directly to `<ReactFlow>` — React Flow's pane handlers can compete. Wrap React Flow in a `<div>` that owns the pointer events; use `e.stopPropagation()` inside drawing handlers + `panOnDrag={false}` in draw mode.

**Coordinate transforms:** always convert pointer events to flow coords via `screenToFlowPosition` *before* pushing into the points array. On commit, compute the bounding box, set the node's `position` to the box origin, store points relative to it. Strokes pan/zoom with the graph but stay spatially independent of content nodes (PRD §9.2).

**Pressure:** mouse events report `pressure === 0`; fall back to `0.5` (covered by `e.pressure || 0.5`). On a pen-capable device, `e.pressure` produces variable stroke width.

**Acceptance:**

1. Click pen tool → click-drag across the canvas → release. A stroke renders along the gesture path with no perceptible lag, stays anchored when you pan/zoom.
2. Pencil / highlighter look visually distinct (thin opaque / broad translucent).
3. Click a color swatch → draw → color applies.
4. Eraser mode → click any prior stroke → it disappears.
5. ⌘Z → erased stroke comes back. ⌘⇧Z → it disappears again. (Phase 3 keyboard binding is a hook into the toolbar buttons; the buttons themselves always work.)
6. Reload the page → strokes persist (proves `maps.data.annotations` survived via `createAnnotation`).
7. Drag a crux tile (edit mode + select mode) → nearby strokes do NOT move with it (PRD §9.2 independence).
8. View-mode user opens the page → toolbar shows 4 swatches (no white) and no `+ ADD CLAIM` pill. They can still draw.
9. Edit-mode user double-clicks a crux text → contenteditable opens → typing updates text in real time → clicking away saves and propagates to every frame instance.
10. Click `+ ADD CLAIM` → new tile appears at viewport center; associated empty `Frame` created.
11. Pixel-stable for view-mode content nodes (PRD §6.7) — adding annotations does not shift nodes.

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

## Phase 5 — Annotation realtime + multi-user

**Goal:** Migrate Phase 3's local-only annotations to a dedicated table + Supabase Realtime so participants see each other's strokes within ~200ms. Add view-vs-edit permission asymmetry and the sticker tool.

Implements: `DIA-ANNO-4` realtime, the remainder of `DIA-ANNO-1` (sticker + marker), Phase 3 → Phase 5 migration of stroke storage.

**Schema migration (Phase 3 ships JSONB-only; Phase 5 adds the table):**

```sql
create table annotations (
  id uuid primary key default gen_random_uuid(),
  map_id text references maps(id) on delete cascade,
  frame_id text,                         -- nullable: crux-view strokes have no frame
  user_id uuid references users(id),
  tool text not null,                    -- pencil | pen | highlighter | textbox | marker | sticker
  color text not null,
  size real not null,
  origin jsonb not null,                 -- {x,y} bounding-box origin
  width real not null,
  height real not null,
  points jsonb not null,                 -- [{x,y,t,pressure}, ...] (relative to origin)
  text text,                             -- only set for tool = 'textbox'
  created_at timestamptz default now()
);
create index on annotations (map_id, frame_id);
```

One-time migration script copies `maps.data.annotations[]` into the table, then drops the field from `ArgMap` (Phase 5 acceptance criterion).

**New code:**

- `lib/realtime/annotations.ts` — Supabase Realtime channel per map; broadcast strokes on `createAnnotation` / `deleteAnnotation`. Subscribe in `CanvasShell` and dispatch into `useUIStore.optimisticAdds` so the same merge path handles both optimistic-self and remote-other strokes.
- `lib/data/annotations.ts` — read/write helpers backed by the new table; replaces the JSONB pattern in `lib/data/mutations.ts`.
- Permission logic in `deleteAnnotation`: view users can only delete annotations where `user_id === current.id`; edit users can delete any.
- Sticker tool: re-uses `StrokeNode` with `tool: 'sticker'` rendering a sticker SVG instead of a stroke path. Sticker assets live in `assets/stickers/` (Phase 10).

**Perf escape hatch:** if SVG-per-node degrades past ~hundreds of strokes during pan/zoom in real maps, replace `StrokeNode` with a single `<canvas>` overlay that draws all strokes per-frame, transformed via `useViewport()`. The data model stays the same; only the renderer changes.

**Acceptance:**

1. Two browser tabs open the same map → drawing in tab A appears in tab B within ~200ms.
2. View-mode user attempts to erase a stroke they didn't draw → no-op (graceful, no error toast).
3. Edit-mode user can erase any stroke regardless of author.
4. Sticker tool drops a sticker at click position; visible identically to other clients.
5. Migration script: existing `maps.data.annotations[]` entries land in the `annotations` table with `created_at` preserved; `maps.data.annotations` is gone after migration.
6. Pan/zoom remains fluid at ≥200 strokes per frame.

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
