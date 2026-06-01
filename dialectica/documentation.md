# Dialectica — Documentation

> Source PRD: [`../Dialectica V6 PRD.md`](../Dialectica%20V6%20PRD.md) · Roadmap for unbuilt phases: [`ROADMAP.md`](ROADMAP.md)

This document describes **what exists today** (Phases 0–5) and how the codebase is organized. For things that haven't been built yet, see [`ROADMAP.md`](ROADMAP.md).

---

## What this app is

Dialectica is a tool for creating, exploring, and annotating **argument maps** — structured visual representations of claims, questions, and the relationships between them. See PRD §1 for the full framing. Two primary use cases: **authoring** (often AI-assisted, ahead of an event) and **participation** (end users explore maps, stake claims, annotate during live discussion).

The current build ships three pixel-perfect read-only views matched against the Figma file [`Dialectia · views`](https://www.figma.com/design/8lnl3MImPRpi6QftZMEDsw/Dialectia-%C2%B7-views):

| Route | View | Figma node | PRD ID |
|---|---|---|---|
| `/` | Homepage / map selector | `2:5` | `DIA-HOME-1` |
| `/m/<mapId>/crux` | Crux view (top-level question + crux tiles) | `2:9` | `DIA-VIEW-1` |
| `/m/<mapId>/frame/<frameId>` | Frame view (claims around a crux) | `2:15` | `DIA-VIEW-2` |
| `/m/<mapId>` | Redirects to `/m/<mapId>/crux` | — | — |

Everything else from the PRD (auth, edit mode, drawing, claim-staking, AI generation, printing, scan-back-in, heatmap iframe, theming) is deferred to module phases — see [`ROADMAP.md`](ROADMAP.md).

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16 App Router** | RSC, Vercel-native, supports future iframe / print / scan / admin routes under one app |
| Renderer | **React 19.2.4** | App Router default |
| Bundler | **Turbopack** | Next.js 16 default |
| Styling | **Tailwind CSS v4** | Token system maps cleanly onto Figma design tokens |
| Components | **shadcn/ui (Radix base)** | Default for product UI on the Vercel stack |
| Canvas | **@xyflow/react (React Flow) 12.10.2** | Node/edge model + pan/zoom built-in; immutable-position view-mode is trivial (`nodesDraggable={false}`) |
| Validation | **Zod 4.4.3** | Single source of truth for the PRD §6.1 entities |
| Client state | **Zustand 5.0.13** (per PRD §6.5) | Lightweight, no provider tree, easy to test |
| Icons | **lucide-react** | Default with shadcn |
| Fonts | Inter + Roboto Mono + Merriweather (Google Fonts) | Closest free substitutes for Figma's Google Sans Flex / Google Sans Code / Merriweather |
| Package manager | **pnpm 11.3.0** | User preference |
| Node | **24+ LTS** (tested on 25.9.0) | Next.js 16 baseline |

Auth + persistence land in Phase 2 via [`@supabase/ssr`](https://supabase.com/docs/guides/auth/server-side/nextjs) (`@supabase/supabase-js` underneath). Realtime + annotation library are still deferred per their later phases.

---

## Folder structure

```
dialectica/
├── app/
│   ├── layout.tsx                          # root layout: fonts, dark theme, providers stub
│   ├── globals.css                         # Tailwind + shadcn + Dialectica design tokens
│   ├── page.tsx                            # DIA-HOME-1 — homepage
│   ├── sign-in/                            # Phase 2 — magic-link signup (PRD §6.6)
│   ├── auth/callback/route.ts              # Phase 2 — Supabase PKCE callback
│   ├── sign-out/route.ts                   # Phase 2 — POST sign-out
│   └── m/[mapId]/
│       ├── page.tsx                        # redirects to /crux
│       ├── crux/page.tsx                   # DIA-VIEW-1
│       └── frame/[frameId]/page.tsx        # DIA-VIEW-2
│
├── proxy.ts                                # Phase 2 — Next.js 16 proxy: auth gate + session refresh
│
├── components/
│   ├── topbar/Topbar.tsx                   # shared chrome (brand, breadcrumb, pills, avatars)
│   ├── homepage/                           # HeroBar, HomepageTabs, MapGrid, MapCard(+Wrapper), MapPreview
│   ├── canvas/CanvasShell.tsx              # React Flow wrapper, minimap, edit-pencil button
│   ├── crux/                               # TopQuestionNode, CruxTileNode, CruxCanvas
│   ├── frame/                              # ClaimNode, QuestionNode, LabeledEdge, FrameCanvas
│   └── ui/                                 # shadcn primitives (button, etc.)
│
├── lib/
│   ├── schema/index.ts                     # Zod types — the data contract (PRD §6.1)
│   ├── supabase/                           # Phase 2 — browser/server clients + session refresh
│   ├── data/
│   │   ├── maps.ts                         # Supabase reads for homepage + canvas pages
│   │   ├── mutations.ts                    # createMap / renameMap / deleteMap (edit-mode only)
│   │   └── users.ts                        # currentUser(), currentMode(), avatarFor()
│   ├── fixtures/seed-map.json              # Google Xi demo map (also seeded into DB)
│   ├── fixtures/stub-maps.ts               # Phase 2 — 5 stub ArgMaps for the rest of the grid
│   ├── state/                              # Zustand stores (none in Phase 2)
│   ├── figma-tokens/                       # reserved for the Phase 10 theming pass
│   └── utils.ts                            # shadcn cn() helper
│
├── db/
│   ├── schema.sql                          # Phase 2 — users, maps, map_access, RLS + new-user trigger
│   └── seed.ts                             # Phase 2 — pushes the 6 fixture maps to Supabase
│
├── docs/                                   # internal-facing notes (state, data model, module map)
│   ├── state-management.md
│   ├── data-model.md
│   └── module-map.md                       # PRD-ID ↔ folder/file mapping
│
├── .screenshots/                           # Figma reference + dev captures used in verification
├── .env.local.example                      # Phase 2 — template for Supabase env vars
├── documentation.md                        # ← this file (what's built)
└── ROADMAP.md                              # what's next (Phases 3–10)
```

---

## Data model

Defined in [`lib/schema/index.ts`](lib/schema/index.ts) as Zod schemas — this file is authoritative. A distilled version is in [`docs/data-model.md`](docs/data-model.md).

```ts
ArgMap {
  id, title, topQuestion, topQuestionPosition, topQuestionSize?, topQuestionFrameId?,
  cruxes:  Crux[]                  // sub-cruxes shown in the crux view
  cruxEdges: Edge[]                // edges in the crux view (sources include "top")
  nodes:   Record<id, Node>        // canonical nodes — exist once (§6.4)
  frames:  Record<id, Frame>       // per-frame node instances + edges
  createdAt, updatedAt
}

Crux        { id, frameId, question, position, size? }
Node        { id, type: 'claim' | 'question', text }
Frame       { id, cruxId, nodeInstances: NodeInstance[], edges: Edge[] }
NodeInstance{ nodeId, position, size? }     // a node's appearance in a frame
Edge        { id, source, target, undirected?, label? }

// Reserved shapes for later phases (defined now to lock the contract):
Annotation  { id, frameId, points, tool, color, size, userId, createdAt }
Stake       { id, frameId, nodeId, userId, createdAt }
```

Key invariants:

- **Cross-frame node identity (§6.4):** a node lives once in `ArgMap.nodes`. Frames render their own `NodeInstance` of it. Editing canonical text propagates everywhere; annotations and stakes (later) attach to the frame instance, not the canonical node.
- **Positions immutable in view mode (§6.7):** `Crux.position`, `NodeInstance.position`, and `topQuestionPosition` are stored explicitly. View-mode pan/zoom never mutates them. Edit mode (Phase 3) is the only path that changes them.
- **Top question is special:** stored as plain text + position + size on `ArgMap` rather than as a `Crux`. If `topQuestionFrameId` is set, clicking the top question in the crux view routes to its frame (matches Figma 2:15 where the top question has its own frame).
- **`cruxId === "top"`** on a frame means "this frame belongs to the top question." The frame page resolves this special value to `map.topQuestion` for the breadcrumb.

---

## Routes & data flow

All page components are React Server Components. They read from [`lib/data/maps.ts`](lib/data/maps.ts) on the server, validate via Zod, and pass plain props to client components for interactive canvases.

### `/` — Homepage

[`app/page.tsx`](app/page.tsx) calls `listMapCards()` and renders:
- [`<Topbar>`](components/topbar/Topbar.tsx) with `DIALECTIA / Home` breadcrumb, `VIEWING` + `● 2 live` pills, EM avatar
- [`<HeroBar>`](components/homepage/HeroBar.tsx) — Aristotle quote + search + `+ NEW MAP` button (button is a no-op in Phase 1; PRD makes it edit-mode-only — to be gated in Phase 2)
- [`<HomepageTabs>`](components/homepage/HomepageTabs.tsx) — "All maps / Shared with me / Public / archived" with underline indicator, plus "Sorted by · last edited"
- [`<MapGrid>`](components/homepage/MapGrid.tsx) — 3-column grid of [`<MapCard>`](components/homepage/MapCard.tsx)s, each with a [`<MapPreview>`](components/homepage/MapPreview.tsx) (one of 6 stylized illustrations), visibility pill, title, edited label, collaborator avatar stack

`listMapCards()` returns 6 cards matching the Figma copy; only the first (`seed-001`) has a full backing `ArgMap`. The other 5 fall back to the seed map when opened so click-through demos work.

### `/m/<mapId>/crux` — Crux view (DIA-VIEW-1)

[`app/m/[mapId]/crux/page.tsx`](app/m/[mapId]/crux/page.tsx) calls `getMap(mapId)` and renders:
- [`<Topbar>`](components/topbar/Topbar.tsx) with `DIALECTIA / <map.title> › Crux map` breadcrumb, EM + JS avatars
- [`<CruxCanvas map={map} />`](components/crux/CruxCanvas.tsx) — a [`<CanvasShell>`](components/canvas/CanvasShell.tsx) wrapping React Flow

The canvas builds nodes and edges in `useMemo`:
- Top question → `TopQuestionNode` (green dashed border, mint accent)
- Each `Crux` → `CruxTileNode` (pink dashed border)
- Each `cruxEdges` entry → smoothstep edge with arrow marker (unless `undirected: true`)

Clicking the top question routes to `/m/<mapId>/frame/<topQuestionFrameId>` if set. Clicking a sub-crux routes to its `frameId`.

### `/m/<mapId>/frame/<frameId>` — Frame view (DIA-VIEW-2)

[`app/m/[mapId]/frame/[frameId]/page.tsx`](app/m/[mapId]/frame/[frameId]/page.tsx) calls `getMap(mapId)`, looks up `map.frames[frameId]`, and renders:
- [`<Topbar>`](components/topbar/Topbar.tsx) with `DIALECTIA / <map.title> › <crux question>` breadcrumb. If `frame.cruxId === "top"`, the breadcrumb uses `map.topQuestion`. The presence pill is `Settings` (matches Figma 2:15).
- [`<FrameCanvas map={map} frame={frame} />`](components/frame/FrameCanvas.tsx)

Each `nodeInstance` becomes either a `ClaimNode` (solid mint) or `QuestionNode` (solid pink, italic — distinguishes from claims at a glance; the Figma example shows only claims). Edges use the custom [`LabeledEdge`](components/frame/LabeledEdge.tsx) — built on top of `BaseEdge` + `EdgeLabelRenderer` to support multi-line HTML labels like "Shifts responsibility from AI traits to human decisions."

Click-on-claim (which will open the side panel per `DIA-VIEW-3.5`) is currently a no-op — Phase 4.

---

## State management

Per PRD §6.5, this project uses Zustand. Phase 1 has **no client stores** — all data flows through Server Component props and React Flow's internal state. Stores will land as later phases need them. The convention is documented in [`docs/state-management.md`](docs/state-management.md); planned stores (`useUIStore`, `useDraftStore`, `useStrokeStore`, `usePresenceStore`) are outlined in the ROADMAP.

---

## Design tokens

Defined in [`app/globals.css`](app/globals.css) under `@theme inline` so Tailwind v4 picks them up as utility classes:

```css
--color-dia-bg:            #000000   /* page background */
--color-dia-surface:       #0f0f0f   /* card bg (Public/Private map cards) */
--color-dia-surface-2:     #0a0a0a   /* minimap container */
--color-dia-border:        #1f1f1f   /* card borders */
--color-dia-border-strong: #3a3a3a   /* topbar bottom border, separators */
--color-dia-border-subtle: #1a1a1a   /* hairline dividers inside cards */
--color-dia-fg:            #ffffff
--color-dia-fg-muted:      #d4d4d4   /* topbar breadcrumb crumbs */
--color-dia-fg-dim:        #8a8a8a   /* timestamps, placeholders, dim text */
--color-dia-fg-disabled:   #3a3a3a
--color-dia-mint:          #cdf4d3   /* top question, claims, "live" pill, NEW MAP */
--color-dia-pink:          #ffc2ec   /* sub-crux tiles, questions */
--color-dia-blue:          #c2e5ff   /* map preview accents */
--color-dia-purple:        #dcccff   /* map preview accents */
```

Usage: `bg-dia-bg`, `text-dia-fg-dim`, `border-dia-border-strong`, etc. — they compose with Tailwind utilities directly. Phase 10 will promote these out of `globals.css` into an `assets/` folder per `DIA-ASSET-1`.

Three fonts loaded via `next/font/google` in [`app/layout.tsx`](app/layout.tsx):

- **Inter** (`--font-inter`) — body / hero (substitute for Google Sans Flex)
- **Roboto Mono** (`--font-roboto-mono`) — all UI chrome, breadcrumbs, tile text, pills
- **Merriweather** (`--font-merriweather`) — homepage tabs only

The shadcn-init Geist-circular-reference bug is patched in `globals.css` lines 10–12 (literal font names rather than `var(--font-sans)`).

---

## Running the app

```bash
cd dialectica
pnpm install           # one-time; some deps need build approval (sharp, unrs-resolver)
pnpm dev               # Next.js + Turbopack on http://localhost:3000
pnpm exec tsc --noEmit # strict typecheck
pnpm lint              # ESLint
```

Build approvals for sharp + unrs-resolver are pinned to true in `pnpm-workspace.yaml`. If you add deps with `postinstall` scripts, pnpm will prompt — set them explicitly in `pnpm-workspace.yaml` rather than running `pnpm approve-builds`.

### Visual verification against Figma

The Figma reference screenshots and dev captures live in [`.screenshots/`](.screenshots/). To re-verify a view against Figma after a change:

1. Run `pnpm dev` and open the route.
2. Use the Chrome DevTools MCP: `take_screenshot` at `1920×1080`.
3. Pull the matching Figma screenshot via the Figma MCP `get_screenshot` at the same `maxDimension`.
4. Compare side-by-side. Iterate on tokens, padding, font weight until parity.

---

## Auth + persistence (Phase 2 → Phase 5)

Auth and the data tables live in Supabase. As of Phase 5 the app points at the **hosted Supabase project** `https://enokfgiwbgianwblplcn.supabase.co`. All tables use the `Dialectica_` prefix (mixed-case, so DDL double-quotes them and the JS client passes the exact string): `Dialectica_users`, `Dialectica_maps`, `Dialectica_map_access`, `Dialectica_stakes`, `Dialectica_annotations`.

1. **First-time setup:**
   - Populate [`.env.local`](.env.local) with the hosted URL and the `sb_publishable_*` publishable key (slotted under `NEXT_PUBLIC_SUPABASE_ANON_KEY` so existing client/server wrappers keep working).
   - Fetch the project's `service_role` key from the Supabase dashboard → Project Settings → API and set `SUPABASE_SERVICE_ROLE_KEY`.
   - Apply schema: open the SQL editor in Supabase Studio and run [`db/schema.sql`](db/schema.sql).
   - Seed the 6 fixture maps: `pnpm db:seed`.
   - Seed participants + stakes: `pnpm db:seed:stakes`.
   - Phase 3 → Phase 5 migration (only relevant if you had JSONB annotations on the old local stack): `pnpm db:migrate:annotations`.
2. **Sign-in:** users enter email + display name on [`/sign-in`](app/sign-in/page.tsx); Supabase sends a magic link that hits [`/auth/callback`](app/auth/callback/route.ts); the PKCE exchange sets the session cookie. The trigger in [`db/schema.sql`](db/schema.sql) inserts a row in `Dialectica_users` on signup — `mpholsch@media.mit.edu` is hard-coded as `role = 'edit'`; everyone else defaults to `view`.
3. **Auth gate:** [`proxy.ts`](proxy.ts) (Next.js 16's renamed middleware) refreshes the Supabase session on every request and bounces unauthenticated users to `/sign-in`.
4. **Mode:** [`currentMode()`](lib/data/users.ts) reads `Dialectica_users.role`. The homepage hides `+ NEW MAP` and the right-click rename/delete menu for view-mode users; mutations in [`lib/data/mutations.ts`](lib/data/mutations.ts) double-check on the server and RLS enforces the same in the DB.
5. **Realtime annotations (Phase 5):** the Phase 3 JSONB-backed `ArgMap.annotations` array is replaced by the `Dialectica_annotations` table. [`lib/data/annotations.ts`](lib/data/annotations.ts) handles reads/writes; [`lib/realtime/annotations.ts`](lib/realtime/annotations.ts) opens a Supabase Realtime channel per map so strokes propagate to other clients within ~200ms. RLS plus a client-side guard in [`useDrawingHandlers`](lib/canvas/useDrawingHandlers.ts) implement the §9.1 rule: view users can only erase their own strokes; edit users can erase any.

### Adding a new map

- **Via the UI:** sign in as an edit-role user and click `+ NEW MAP`. This calls `createMap()` (server action) which inserts an empty `ArgMap` and routes to `/m/<id>/crux`.
- **From SQL:** `insert into maps (id, title, visibility, data) values (..., '<argmap-json>')` — `data` must validate against the `ArgMap` Zod schema in [`lib/schema/index.ts`](lib/schema/index.ts).
- **From a fixture file:** add an entry in [`lib/fixtures/stub-maps.ts`](lib/fixtures/stub-maps.ts) (or import a new JSON), wire its presentation metadata into [`CARD_PRESENTATION`](lib/data/maps.ts) for grid styling, then re-run `pnpm dlx tsx db/seed.ts`.

---

## Intentional deviations from Figma

| Area | What we did | Why |
|---|---|---|
| Fonts | Inter / Roboto Mono / Merriweather | Figma uses Google Sans Flex and Google Sans Code which aren't free. These are the closest Google Fonts equivalents. |
| `QuestionNode` color | Solid pink (vs. mint claims) | The Figma frame example shows only claims. Differentiating questions visually helps when fixtures mix types. |
| `+ NEW MAP` button gated by role | Visible only to `role = 'edit'` users (Phase 2) | Matches PRD §5.1 + §6.6. View-mode users see the same Figma layout minus the button. |
| Minimap nodes | React Flow's built-in rectangles, colored by tint | Figma shows stylized circles + a viewport indicator. Functionally equivalent for navigation; refine in Phase 10 if needed. |
| Card titles font | Roboto Mono | Figma uses Google Sans Code (monospace flavor). Roboto Mono is the closest free equivalent. |

---

## Verification status

- ✅ `pnpm exec tsc --noEmit` — clean
- ✅ `pnpm lint` — clean
- ✅ All 4 routes return HTTP 200 (`/`, `/m/seed-001`, `/m/seed-001/crux`, `/m/seed-001/frame/frame-tool-risk`)
- ✅ No console errors on any view (no React Flow MiniMap NaN warnings, no hydration warnings)
- ✅ Crux + frame views pixel-checked against Figma 2:9 and 2:15 via Chrome DevTools MCP

---

## Where to look next

- **What's already built** — this file
- **What's not built and how to build it** — [`ROADMAP.md`](ROADMAP.md)
- **The source PRD** — [`../Dialectica V6 PRD.md`](../Dialectica%20V6%20PRD.md)
- **Internal architectural notes** — [`docs/`](docs/) (state-management, data-model, module-map)
- **The Figma file** — [`Dialectia · views`](https://www.figma.com/design/8lnl3MImPRpi6QftZMEDsw/Dialectia-%C2%B7-views)
