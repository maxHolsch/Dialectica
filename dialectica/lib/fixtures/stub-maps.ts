import type { ArgMap } from "@/lib/schema";

// Lightweight ArgMaps for the 5 non-seed homepage cards. Phase 2 seeds these into
// the DB alongside the rich Google Xi map so every card on the homepage opens
// into a real, schema-valid map. Phase 7's AI pipeline will replace them with
// generated content; for now they exist so the click-through demo is complete.

function stubMap(args: {
  id: string;
  title: string;
  topQuestion: string;
  createdAt: string;
  updatedAt: string;
  cruxA: { question: string; claimA: string; claimB: string };
  cruxB: { question: string; claimA: string; claimB: string };
}): ArgMap {
  const { id, title, topQuestion, createdAt, updatedAt, cruxA, cruxB } = args;
  return {
    id,
    title,
    topQuestion,
    topQuestionPosition: { x: 818, y: 81 },
    topQuestionSize: { width: 291, height: 265 },
    topQuestionFrameId: `${id}-frame-top`,
    annotations: [],
    createdAt,
    updatedAt,
    cruxes: [
      {
        id: `${id}-crux-a`,
        frameId: `${id}-frame-a`,
        question: cruxA.question,
        position: { x: 320, y: 480 },
        size: { width: 336, height: 220 },
      },
      {
        id: `${id}-crux-b`,
        frameId: `${id}-frame-b`,
        question: cruxB.question,
        position: { x: 1280, y: 480 },
        size: { width: 336, height: 220 },
      },
    ],
    cruxEdges: [
      { id: `${id}-ce-1`, source: "top", target: `${id}-crux-a` },
      { id: `${id}-ce-2`, source: "top", target: `${id}-crux-b` },
    ],
    nodes: {
      [`${id}-n-a1`]: { id: `${id}-n-a1`, type: "claim", text: cruxA.claimA },
      [`${id}-n-a2`]: { id: `${id}-n-a2`, type: "claim", text: cruxA.claimB },
      [`${id}-n-b1`]: { id: `${id}-n-b1`, type: "claim", text: cruxB.claimA },
      [`${id}-n-b2`]: { id: `${id}-n-b2`, type: "claim", text: cruxB.claimB },
      [`${id}-n-top-q`]: {
        id: `${id}-n-top-q`,
        type: "question",
        text: topQuestion,
      },
    },
    frames: {
      [`${id}-frame-top`]: {
        id: `${id}-frame-top`,
        cruxId: "top",
        nodeInstances: [
          {
            nodeId: `${id}-n-a1`,
            position: { x: 428, y: 200 },
            size: { width: 368, height: 240 },
          },
          {
            nodeId: `${id}-n-b1`,
            position: { x: 1124, y: 200 },
            size: { width: 368, height: 240 },
          },
        ],
        edges: [
          {
            id: `${id}-et-1`,
            source: `${id}-n-a1`,
            target: `${id}-n-b1`,
            undirected: true,
            label: "tension",
          },
        ],
      },
      [`${id}-frame-a`]: {
        id: `${id}-frame-a`,
        cruxId: `${id}-crux-a`,
        nodeInstances: [
          {
            nodeId: `${id}-n-a1`,
            position: { x: 428, y: 200 },
            size: { width: 368, height: 240 },
          },
          {
            nodeId: `${id}-n-a2`,
            position: { x: 1124, y: 200 },
            size: { width: 368, height: 240 },
          },
        ],
        edges: [
          {
            id: `${id}-ea-1`,
            source: `${id}-n-a1`,
            target: `${id}-n-a2`,
            undirected: true,
            label: "tension",
          },
        ],
      },
      [`${id}-frame-b`]: {
        id: `${id}-frame-b`,
        cruxId: `${id}-crux-b`,
        nodeInstances: [
          {
            nodeId: `${id}-n-b1`,
            position: { x: 428, y: 200 },
            size: { width: 368, height: 240 },
          },
          {
            nodeId: `${id}-n-b2`,
            position: { x: 1124, y: 200 },
            size: { width: 368, height: 240 },
          },
        ],
        edges: [
          {
            id: `${id}-eb-1`,
            source: `${id}-n-b1`,
            target: `${id}-n-b2`,
            undirected: true,
            label: "tension",
          },
        ],
      },
    },
  };
}

export const STUB_MAPS: ArgMap[] = [
  stubMap({
    id: "map-debatex",
    title: "DebateX Symposiums",
    topQuestion: "What format produces the best public deliberation?",
    createdAt: "2026-05-25T00:00:00.000Z",
    updatedAt: "2026-05-26T00:00:00.000Z",
    cruxA: {
      question: "Does adversarial structure illuminate or harden positions?",
      claimA: "Adversarial structure exposes the strongest counter-arguments.",
      claimB: "Adversarial structure entrenches teams and discourages updating.",
    },
    cruxB: {
      question: "Should audiences vote, deliberate, or just witness?",
      claimA: "Voting forces audiences to commit and reflect.",
      claimB: "Voting reduces nuanced positions to a single binary.",
    },
  }),
  stubMap({
    id: "map-max-essays",
    title: "Max's Essays",
    topQuestion: "What makes a personal essay worth re-reading?",
    createdAt: "2026-05-22T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    cruxA: {
      question: "Is voice or argument the load-bearing element?",
      claimA: "Voice carries the reader through weak arguments.",
      claimB: "A tight argument survives even a flat voice.",
    },
    cruxB: {
      question: "Should an essay land on a thesis or leave one open?",
      claimA: "Landing on a thesis respects the reader's time.",
      claimB: "Open endings model the actual texture of thought.",
    },
  }),
  stubMap({
    id: "map-manosphere",
    title: "Online Discourse on the Manosphere",
    topQuestion: "Is the manosphere a symptom or a cause of broader cultural shifts?",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-14T00:00:00.000Z",
    cruxA: {
      question: "Does it fill a vacuum left by other institutions?",
      claimA: "It substitutes for community structures men have lost.",
      claimB: "It manufactures the vacuum it claims to fill.",
    },
    cruxB: {
      question: "Are its prescriptions actually downstream of its diagnoses?",
      claimA: "The prescriptions follow logically from the diagnoses.",
      claimB: "The prescriptions are pre-packaged; the diagnoses are post-hoc.",
    },
  }),
  stubMap({
    id: "map-academics",
    title: "Academics Who Build Event #1",
    topQuestion: "What should academics who build prioritize first?",
    createdAt: "2026-04-09T00:00:00.000Z",
    updatedAt: "2026-04-11T00:00:00.000Z",
    cruxA: {
      question: "Research-as-product, or product-as-research?",
      claimA: "Shipping a product produces research insights you can't get otherwise.",
      claimB: "Optimizing for product reach distorts what you'll discover.",
    },
    cruxB: {
      question: "Who is the audience — peers or users?",
      claimA: "Peers are the only audience that improves your epistemics.",
      claimB: "Users tell you faster which ideas survive contact with reality.",
    },
  }),
  stubMap({
    id: "map-untitled",
    title: "Untitled map",
    topQuestion: "What is this map about?",
    createdAt: "2026-04-08T00:00:00.000Z",
    updatedAt: "2026-04-09T00:00:00.000Z",
    cruxA: {
      question: "Placeholder crux A",
      claimA: "Placeholder claim A1",
      claimB: "Placeholder claim A2",
    },
    cruxB: {
      question: "Placeholder crux B",
      claimA: "Placeholder claim B1",
      claimB: "Placeholder claim B2",
    },
  }),
];
