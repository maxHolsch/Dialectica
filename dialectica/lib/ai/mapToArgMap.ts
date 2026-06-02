import { ArgMap, type ArgMap as ArgMapT } from "@/lib/schema";
import type { PipelineOutput } from "./pipeline";

// PipelineOutput → ArgMap. Pure function. Unit-testable with fixtures.
//
// Mapping (per ROADMAP Phase 7):
//   central_question → one crux + one frame (same id pair).
//   claim attached to a question → NodeInstance inside that frame; the canonical
//     node id is the claim id, so a claim referenced by multiple questions
//     becomes the same node id across multiple frames (PRD §6.4 frame-instance).
//   relationships[]                → edges inside the corresponding frame, with
//     `relType` carrying the free-form palette label verbatim.
//   cross_question_relationships[] → ArgMap.crossLinks[]. Drives the visual
//     "appears in multiple frames" marker via shared_claim_ids.
//   momentum                       → ArgMap.meta.momentum.
//   fact_check_todos               → ArgMap.meta.factCheckTodos.

// Deterministic layout: cruxes around a circle on the crux canvas, claim nodes
// around a smaller ring inside each frame. Pure geometry, no DOM.
const CRUX_CENTER = { x: 960, y: 520 };
const CRUX_RING_RADIUS = 360;
const CRUX_SIZE = { width: 280, height: 140 };
const FRAME_CENTER = { x: 720, y: 480 };
const FRAME_RING_RADIUS = 280;

function pointOnRing(
  cx: number,
  cy: number,
  r: number,
  index: number,
  total: number,
  rotateRad = -Math.PI / 2,
) {
  const theta = rotateRad + (index / Math.max(1, total)) * Math.PI * 2;
  return { x: cx + r * Math.cos(theta), y: cy + r * Math.sin(theta) };
}

export function mapToArgMap(args: {
  mapId: string;
  title: string;
  topQuestion: string;
  pipeline: PipelineOutput;
  now?: string;
  generationRunId?: string;
}): ArgMapT {
  const now = args.now ?? new Date().toISOString();
  const { pipeline } = args;
  const questions = pipeline.central_questions;

  // 1. Canonical nodes — one per distilled claim, ids preserved verbatim.
  const nodes: ArgMapT["nodes"] = {};
  for (const c of pipeline.claims) {
    nodes[c.id] = {
      id: c.id,
      type: "claim",
      text: c.text,
      isFactual: c.is_factual,
      absorbed: c.absorbed,
    };
  }

  // 2. Cruxes + frames — one per central question.
  const cruxes: ArgMapT["cruxes"] = [];
  const frames: ArgMapT["frames"] = {};

  questions.forEach((q, qi) => {
    const cruxPos = pointOnRing(
      CRUX_CENTER.x,
      CRUX_CENTER.y,
      CRUX_RING_RADIUS,
      qi,
      questions.length,
    );
    cruxes.push({
      id: q.id,
      frameId: q.id,
      question: q.question,
      position: cruxPos,
      size: CRUX_SIZE,
    });

    // Nodes attached to this question. A claim may be referenced by multiple
    // questions — that's fine, the canonical node id is the same and each
    // frame holds its own NodeInstance with its own position.
    const claimIds = q.claim_ids.filter((id) => nodes[id]);
    const nodeInstances = claimIds.map((claimId, ci) => ({
      nodeId: claimId,
      position: pointOnRing(
        FRAME_CENTER.x,
        FRAME_CENTER.y,
        FRAME_RING_RADIUS,
        ci,
        claimIds.length,
      ),
      size: { width: 240, height: 120 },
    }));

    // Edges = within-question relationships for this question. Stage 4
    // produced ids that should reference claims in this question's group, but
    // we defensively drop edges whose endpoints aren't in this frame.
    //
    // `relType` keeps the palette label (the KIND). `label` carries the note
    // (the specific way the relationship holds) so the canvas can surface the
    // texture, not just the category.
    const inFrame = new Set(claimIds);
    const edges = pipeline.relationships
      .filter(
        (r) =>
          r.question_id === q.id &&
          inFrame.has(r.from) &&
          inFrame.has(r.to),
      )
      .map((r, ei) => ({
        id: `${q.id}-e${ei}`,
        source: r.from,
        target: r.to,
        relType: r.type,
        label: r.note,
      }));

    frames[q.id] = {
      id: q.id,
      cruxId: q.id,
      nodeInstances,
      edges,
    };
  });

  // 3. Cross-question relationships → both crossLinks (data) and cruxEdges
  // (rendered on the crux view). cruxEdges is what the CruxCanvas actually
  // draws between crux tiles; populating it makes question-to-question
  // connections visible the way claim-to-claim connections are inside a
  // frame. `relType` holds the palette label (empty for question-guided),
  // `label` holds the short verb phrase / note.
  const knownQ = new Set(questions.map((q) => q.id));
  const filteredCross = pipeline.cross_question_relationships.filter(
    (x) => knownQ.has(x.from) && knownQ.has(x.to),
  );
  const crossLinks = filteredCross.map((x) => ({
    from: x.from,
    to: x.to,
    type: x.type,
    note: x.note,
    sharedClaimIds: x.shared_claim_ids.filter((id) => nodes[id]),
  }));
  const cruxEdges = filteredCross.map((x, i) => ({
    id: `cx-${i}`,
    source: x.from,
    target: x.to,
    relType: x.type,
    label: x.note,
  }));

  // 4. Momentum + fact-check todos → meta.
  const meta = {
    momentum: {
      highestLeverageQuestion: pipeline.momentum.highest_leverage_question,
      rationale: pipeline.momentum.rationale,
      latentAgreements: pipeline.momentum.latent_agreements.map((a) => ({
        claimIds: a.claim_ids.filter((id) => nodes[id]),
        note: a.note,
      })),
    },
    factCheckTodos: pipeline.fact_check_todos
      .filter((t) => nodes[t.claim_id])
      .map((t) => ({
        claimId: t.claim_id,
        claimText: t.claim_text,
        whatToCheck: t.what_to_check,
      })),
    generationRunId: args.generationRunId,
  };

  const map: ArgMapT = {
    id: args.mapId,
    title: args.title,
    topQuestion: args.topQuestion,
    topQuestionPosition: { x: 818, y: 81 },
    topQuestionSize: { width: 291, height: 265 },
    cruxes,
    cruxEdges,
    nodes,
    frames,
    annotations: [],
    crossLinks,
    meta,
    createdAt: now,
    updatedAt: now,
  };

  // Validate before returning — catches schema drift between this mapper and
  // lib/schema if the ArgMap shape evolves.
  return ArgMap.parse(map);
}
