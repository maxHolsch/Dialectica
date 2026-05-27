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

export const Node = z.object({
  id: z.string(),
  type: NodeType,
  text: z.string(),
});
export type Node = z.infer<typeof Node>;

export const Edge = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  undirected: z.boolean().optional(),
  label: z.string().optional(),
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
