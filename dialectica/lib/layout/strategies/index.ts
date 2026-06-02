// Auto-format strategy registry. A strategy is just a bag of ELK layout
// options the adapter applies to every subgraph it builds. New strategies
// (force, stress, mr-tree, …) drop in as a single entry.

export type LayoutStrategyId = "layered-down" | "layered-right" | "radial";

export type LayoutStrategy = {
  id: LayoutStrategyId;
  label: string;
  description: string;
  /** ELK layout options merged into the graph root. */
  elkOptions: Record<string, string>;
};

const SHARED_LAYERED: Record<string, string> = {
  "elk.algorithm": "layered",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.portConstraints": "FIXED_SIDE",
  "elk.layered.feedbackEdges": "true",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
  "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "elk.spacing.nodeNode": "70",
  "elk.spacing.edgeEdge": "24",
  "elk.spacing.edgeNode": "32",
  "elk.spacing.edgeLabel": "12",
  "elk.layered.spacing.nodeNodeBetweenLayers": "90",
  "elk.layered.spacing.edgeNodeBetweenLayers": "40",
  "elk.layered.spacing.edgeEdgeBetweenLayers": "20",
  "elk.layered.edgeLabels.sideSelection": "ALWAYS_UP",
};

export const LAYOUT_STRATEGIES: Record<LayoutStrategyId, LayoutStrategy> = {
  "layered-down": {
    id: "layered-down",
    label: "Layered ↓",
    description:
      "Top question at the top, cruxes flow downward. Best for argument-tree reading.",
    elkOptions: { ...SHARED_LAYERED, "elk.direction": "DOWN" },
  },
  "layered-right": {
    id: "layered-right",
    label: "Layered →",
    description:
      "Top question on the left, claims/cruxes flow rightward. Better for wide screens.",
    elkOptions: { ...SHARED_LAYERED, "elk.direction": "RIGHT" },
  },
  radial: {
    id: "radial",
    label: "Radial",
    description:
      "Top question / first node in the center, others arranged around it. Mind-map feel.",
    elkOptions: {
      "elk.algorithm": "radial",
      "elk.portConstraints": "FIXED_SIDE",
      "elk.spacing.nodeNode": "100",
      "elk.radial.radius": "420",
      "elk.radial.optimizationCriteria": "EDGE_LENGTH",
    },
  },
};

export const DEFAULT_STRATEGY: LayoutStrategyId = "layered-down";

export function isLayoutStrategyId(v: unknown): v is LayoutStrategyId {
  return (
    typeof v === "string" &&
    (v === "layered-down" || v === "layered-right" || v === "radial")
  );
}

export function resolveStrategy(v: unknown): LayoutStrategyId {
  return isLayoutStrategyId(v) ? v : DEFAULT_STRATEGY;
}
