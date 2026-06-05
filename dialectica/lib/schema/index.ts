import { z } from "zod";

// PRD §6.1 — Node and edge types
// Nodes are canonical: each node exists exactly once on a map (§6.4).
// When a node appears in multiple frames, each frame holds its own NodeInstance
// with a position; annotations and stakes attach to the frame instance, not the canonical node.

export const Position = z.object({
  x: z.number(),
  y: z.number(),
});
export type Position = z.infer<typeof Position>;

export const Size = z.object({
  width: z.number(),
  height: z.number(),
});
export type Size = z.infer<typeof Size>;

export const NodeType = z.enum(["claim", "question"]);
export type NodeType = z.infer<typeof NodeType>;

// Audio snippet feature — one related transcript span for a claim, with exact
// audio timestamps so the claim's quote-mark drawer can play the recording.
// `startMs`/`endMs` are offsets into the conversation recording referenced by
// `ArgMap.meta.audio`. Produced by the standalone snippet pipeline (admin),
// ranked 1..5 by an LLM. See lib/ai/snippets/.
export const ClaimSnippet = z.object({
  rank: z.number(),
  speakerName: z.string(),
  speakerLabel: z.string().optional(),
  text: z.string(),
  startMs: z.number(),
  endMs: z.number(),
  relevance: z.string().optional(),
});
export type ClaimSnippet = z.infer<typeof ClaimSnippet>;

export const Node = z.object({
  id: z.string(),
  type: NodeType,
  text: z.string(),
  // Phase 7 (DIA-AI-1) annotations on nodes produced by the AI pipeline.
  // `isFactual` flags claims that the fact-check side layer may want to verify.
  // `absorbed` records the raw restatements collapsed into this canonical claim
  // by Stage 2 (dedup) — surfaced in the side panel for merge transparency.
  // `quotes` holds verbatim supporting excerpts from the source transcript,
  // with the speaker label preserved from the labeled transcript format.
  // `snippets` holds the top-5 related transcript spans WITH audio timestamps
  // (the quote-mark drawer); produced by the standalone snippet pipeline.
  isFactual: z.boolean().optional(),
  absorbed: z.array(z.string()).optional(),
  quotes: z
    .array(z.object({ speaker: z.string(), text: z.string() }))
    .optional(),
  snippets: z.array(ClaimSnippet).optional(),
});
export type Node = z.infer<typeof Node>;

// xyflow handle ids assigned by the auto-format layout. Each node renders
// SLOTS_PER_SIDE source-only handles and the same number of target-only
// handles per cardinal side (so the auto-format pass can fan multiple edges
// out along one side instead of stacking them on a single anchor).
// Shape: `${dir}-${side}` (legacy, single anchor) or `${dir}-${side}-${slot}`
// (e.g. "src-top-2" = source handle, slot index 2 along the top side).
export const HandleId = z
  .string()
  .regex(/^(src|tgt)-(top|bottom|left|right)(-\d+)?$/);
export type HandleId = z.infer<typeof HandleId>;

export const Edge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  undirected: z.boolean().optional(),
  label: z.string().optional(),
  // Phase 7 (DIA-AI-1) — free-form relationship type from the open palette
  // (supports, challenges, qualifies, reframes, depends-on, raises, …).
  // Stored verbatim — no enum constraint, since Stage 4 may coin new labels.
  relType: z.string().optional(),
  // Offset of the edge label along the path, as a fraction in [-0.45, 0.45].
  // 0 = center, positive = toward target, negative = toward source.
  // Persisted when a user drags the label in move mode.
  labelOffset: z.number().optional(),
  // Auto-format output: which side of each node this edge attaches to. xyflow
  // consumes these directly to route from the matching named Handle.
  sourceHandle: HandleId.optional(),
  targetHandle: HandleId.optional(),
  curvature: z.number().optional(),
});
export type Edge = z.infer<typeof Edge>;

// PRD §6.4 — A node's per-frame appearance. Position is immutable in view mode (§6.7).
export const NodeInstance = z.object({
  nodeId: z.string(),
  position: Position,
  size: Size.optional(),
});
export type NodeInstance = z.infer<typeof NodeInstance>;

// PRD §5.2 — Frame: claims/questions arranged around a crux.
export const Frame = z.object({
  id: z.string(),
  cruxId: z.string(),
  nodeInstances: z.array(NodeInstance),
  edges: z.array(Edge),
});
export type Frame = z.infer<typeof Frame>;

// PRD §5.1 — Crux: a sub-question tile rendered in the crux view, anchoring a frame.
export const Crux = z.object({
  id: z.string(),
  frameId: z.string(),
  question: z.string(),
  position: Position,
  size: Size.optional(),
});
export type Crux = z.infer<typeof Crux>;

// PRD §9.2 — Annotation. Phase 3 wires pencil/pen/highlighter/textbox via perfect-freehand.
// marker/sticker stay in the enum for Phase 5. Strokes attach to a frame when on the
// frame view, or have frameId undefined when drawn on the crux canvas.
export const AnnotationTool = z.enum([
  "pencil",
  "pen",
  "highlighter",
  "textbox",
  "marker",
  "eraser",
  "sticker",
]);
export type AnnotationTool = z.infer<typeof AnnotationTool>;

export const StrokePoint = z.object({
  x: z.number(),
  y: z.number(),
  t: z.number(),
  pressure: z.number().optional(),
});
export type StrokePoint = z.infer<typeof StrokePoint>;

export const Annotation = z.object({
  id: z.string(),
  frameId: z.string().optional(),
  points: z.array(StrokePoint),
  tool: AnnotationTool,
  color: z.string(),
  size: z.number(),
  // Bounding box origin in flow coordinates; points are stored relative to this.
  origin: Position,
  width: z.number(),
  height: z.number(),
  // Only set when tool === "textbox".
  text: z.string().optional(),
  userId: z.string(),
  createdAt: z.string(),
});
export type Annotation = z.infer<typeof Annotation>;

// Phase 7 (DIA-AI-1) — cross-question relationships rendered on the crux view
// between cruxes. `shared_claim_ids` informs the visual "appears in multiple
// frames" marker on those nodes.
export const CrossLink = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
  note: z.string().optional(),
  sharedClaimIds: z.array(z.string()).default([]),
});
export type CrossLink = z.infer<typeof CrossLink>;

// Phase 7 momentum lens output. Stored on ArgMap.meta so the crux view can
// emphasize the highest-leverage question and admin can surface latent
// agreements without the canvas needing to know about them yet.
export const Momentum = z.object({
  highestLeverageQuestion: z.string(),
  rationale: z.string(),
  latentAgreements: z.array(
    z.object({
      claimIds: z.array(z.string()),
      note: z.string(),
    }),
  ),
});
export type Momentum = z.infer<typeof Momentum>;

export const FactCheckTodo = z.object({
  claimId: z.string(),
  claimText: z.string(),
  whatToCheck: z.string(),
});
export type FactCheckTodo = z.infer<typeof FactCheckTodo>;

// PRD §5.1 + §6 — The full map: top-level question + cruxes + frames + canonical nodes.
// The top question is anchored by its text + position + (optional) size. If
// `topQuestionFrameId` is set, clicking the top question in the crux view
// navigates to that frame — the Figma 2:15 design surfaces the top question's
// own frame this way.
export const ArgMap = z.object({
  id: z.string(),
  title: z.string(),
  topQuestion: z.string(),
  topQuestionPosition: Position,
  topQuestionSize: Size.optional(),
  topQuestionFrameId: z.string().optional(),
  cruxes: z.array(Crux),
  cruxEdges: z.array(Edge),
  nodes: z.record(z.string(), Node),
  frames: z.record(z.string(), Frame),
  annotations: z.array(Annotation).default([]),
  // Phase 7 additions (all optional so pre-Phase-7 maps validate unchanged).
  crossLinks: z.array(CrossLink).default([]),
  meta: z
    .object({
      momentum: Momentum.optional(),
      factCheckTodos: z.array(FactCheckTodo).default([]),
      generationRunId: z.string().optional(),
      // The conversation recording these snippets index into. `path` is the
      // Supabase Storage object path; `publicUrl` is set when served from a
      // public bucket (otherwise the client mints a signed URL). `durationMs`
      // is the full recording length. Written by the snippet pipeline.
      audio: z
        .object({
          path: z.string(),
          publicUrl: z.string().optional(),
          durationMs: z.number().optional(),
        })
        .optional(),
    })
    .optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ArgMap = z.infer<typeof ArgMap>;

// PRD §10.1 — Claim stake. Reserved for Phase 4.
// Attached to a frame instance: (frameId, nodeId).
export const Stake = z.object({
  id: z.string(),
  frameId: z.string(),
  nodeId: z.string(),
  userId: z.string(),
  createdAt: z.string(),
});
export type Stake = z.infer<typeof Stake>;

// PRD §4.0 — homepage list item shape (subset of ArgMap for grid rendering).
export const MapSummary = z.object({
  id: z.string(),
  title: z.string(),
  topQuestion: z.string(),
  updatedAt: z.string(),
});
export type MapSummary = z.infer<typeof MapSummary>;
