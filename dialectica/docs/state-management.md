# State management

Per PRD §6.5, this project uses **Zustand** for client state.

## Convention

- One store per concern. Stores live in [lib/state/](../lib/state/) and are named `use<Name>Store.ts` (e.g. `useUIStore.ts`).
- **Server-derived data is not in Zustand.** Map data is loaded via the data layer ([lib/data/maps.ts](../lib/data/maps.ts)) in Server Components and passed down as props. Zustand holds only client-only UI state (viewport zoom level, selected node, side-panel open/closed, etc.) and — in later phases — staged-but-unsaved edits, in-flight annotation strokes, and real-time presence.
- Stores expose **plain actions**, not setters. `useUIStore.openSidePanel(nodeId)` rather than `setSidePanelNode(nodeId)`.
- Selectors are colocated in the consuming component; we don't define a separate selector module unless one is reused 3+ times.
- Hydration: stores are created at module scope. Pages that read from them must be Client Components (`"use client"`).

## Phase 1 stores

None required. The 3 read-only views render directly from the map data passed by the route's Server Component. UI state (zoom, pan) is owned by React Flow internally.

## Future store sketches

- `useUIStore` — side-panel state, current view mode (view vs edit), active toolbar tool.
- `useDraftStore` — staged-but-unsaved edits in edit mode, before they flush to the data layer.
- `useStrokeStore` — in-flight annotation strokes during a draw gesture (Phase 5).
- `usePresenceStore` — other connected users' cursors / selections (Phase 5).
