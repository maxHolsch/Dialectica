# Module map

Which PRD feature IDs live in which folders. Update as features land.

| PRD ID | Folder / file | Phase |
|---|---|---|
| `DIA-MAP-1` (node/edge types) | [lib/schema/index.ts](../lib/schema/index.ts) | 1 |
| `DIA-MAP-2` (JSON source of truth) | [lib/fixtures/](../lib/fixtures/), [lib/data/maps.ts](../lib/data/maps.ts) | 1 (fixture); 2 (Supabase) |
| `DIA-MAP-3` (direct JSON interface) | curators edit `lib/fixtures/*.json` directly in P1 | 1 |
| `DIA-MAP-4` (cross-frame node identity) | `ArgMap.nodes` keyed canonically; `Frame.nodeInstances` per-frame | 1 |
| `DIA-HOME-1` (homepage) | [app/page.tsx](../app/page.tsx), [components/homepage/](../components/homepage/) | 1 (view-mode); 2 (writes) |
| `DIA-VIEW-1` (crux view) | [app/m/[mapId]/crux/page.tsx](../app/m/), [components/crux/](../components/crux/) | 1 |
| `DIA-VIEW-2` (frame view) | [app/m/[mapId]/frame/[frameId]/page.tsx](../app/m/), [components/frame/](../components/frame/) | 1 |
| `DIA-VIEW-3.5` (frame side panel) | components/frame/SidePanel | 4 |
| `DIA-VIEW-3.7` (heatmap iframe) | components/frame/HeatmapPanel | 9 |
| `DIA-MODE-1` (view mode) | implicit in P1 (no auth gate) | 2 (auth) |
| `DIA-MODE-2` (edit mode) | components/{crux,frame}/edit-* + toolbar | 3 |
| `DIA-CLAIM-1` (claim staking) | components/frame/StakeButton, lib/data/stakes.ts | 4 |
| `DIA-ANNO-1..4` (annotations) | components/canvas/AnnotationLayer, lib/data/annotations.ts | 5 |
| `DIA-VER-1` (version control) | server-side event log + CLI inspector | 6 |
| `DIA-AI-1` (AI generation) | app/api/ai/*, lib/ai/ + workflow | 7 |
| `DIA-AI-4` (admin page) | app/admin/ | 7 |
| `DIA-PRINT-1` (print booklet) | app/print/[mapId]/ | 8 |
| `DIA-PRINT-2` (scan-in) | app/scan/ + app/api/scan/ | 8 |
| `DIA-ASSET-1` (theming) | app/globals.css tokens + lib/figma-tokens/ | 10 |

State management convention: see [state-management.md](./state-management.md).
Data model details: see [data-model.md](./data-model.md).
