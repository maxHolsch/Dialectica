# Data model

Distilled from PRD §6. Authoritative source is [lib/schema/index.ts](../lib/schema/index.ts) (Zod schemas).

## Entities

| Entity | What it is | Where it lives |
|---|---|---|
| **Node** | A `claim` or `question`. Canonical text — one node, one place. | `ArgMap.nodes` (keyed by id) |
| **Edge** | Relationship between two nodes (or two cruxes). Directed by default; `undirected: true` only when explicitly symmetric. | `Frame.edges` (within a frame) or `ArgMap.cruxEdges` (top-level crux map) |
| **NodeInstance** | A node's appearance in a specific frame, with its own position. | `Frame.nodeInstances` |
| **Frame** | A grouping of claims/questions around a crux. | `ArgMap.frames` (keyed by id) |
| **Crux** | The anchor question of a frame; rendered as a tile in the crux view. | `ArgMap.cruxes` |
| **ArgMap** | The whole map: top-level question + cruxes + crux-level edges + canonical nodes + frames. | The unit persisted as JSON (§6.2) |
| **Annotation** | A hand-drawn stroke attached to a frame in frame-local coords. Phase 5. | TBD storage layer |
| **Stake** | A user's "I stand behind this" mark on a specific (frame, node). Phase 4. | TBD storage layer |

## Cross-frame node identity (§6.4)

A node exists **once**. Editing its text propagates everywhere it's rendered. Frame instances differ only in position. Annotations attach to the frame; stakes attach to (frame, node).

## Positions (§6.7)

`Crux.position` and `NodeInstance.position` are stored explicitly. **In view mode they are immutable.** Edit mode (Phase 3) is the only path that mutates them, and changes persist globally.

## JSON as source of truth (§6.2)

Maps are stored as JSON. Phase 1 reads them from [lib/fixtures/](../lib/fixtures/). Phase 2 replaces the loader with Supabase but the on-the-wire shape stays identical so diffs (§8.1) remain meaningful.
