#!/usr/bin/env node
/**
 * Reformat the google-xi-test6 fixture using ELK.
 * Pure CJS — no tsx, no module bundling, no import aliases.
 * Ports pickFrameStrategy + chooseSides + assignSlots from elkAdapter.ts.
 *
 * Usage: node scripts/reformat-fixture.cjs
 */
"use strict";

const { execFile } = require("child_process");
const { resolve } = require("path");
const { readFileSync, writeFileSync } = require("fs");

const WORKER = resolve(__dirname, "../lib/layout/elk-worker.cjs");
const FIXTURE = resolve(__dirname, "../lib/fixtures/google-xi-test6.json");

// ── ELK strategy options (mirrors strategies.ts) ──────────────────────────────
const STRATEGIES = {
  "layered-right": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.spacing.nodeNode": "48",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  },
  "layered-down": {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.layered.spacing.nodeNodeBetweenLayers": "80",
    "elk.spacing.nodeNode": "48",
    "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
  },
};

// ── pickFrameStrategy (mirrors autoFormatArgMap.ts) ───────────────────────────
function pickFrameStrategy(nodes, edges) {
  if (nodes.length <= 1) return "layered-down";
  const inDegree = {};
  const adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    (adj[e.source] = adj[e.source] || []).push(e.target);
  }
  const depth = {};
  for (const n of nodes) depth[n.id] = 0;
  const queue = nodes.filter(n => (inDegree[n.id] || 0) === 0).map(n => n.id);
  const maxIter = nodes.length * nodes.length;
  for (let i = 0; i < queue.length && i < maxIter; i++) {
    const cur = queue[i];
    for (const nxt of adj[cur] || []) {
      const d = (depth[cur] || 0) + 1;
      if (d > (depth[nxt] || 0)) { depth[nxt] = d; queue.push(nxt); }
    }
  }
  const maxDepth = Math.max(...Object.values(depth));
  const widthByLevel = new Array(maxDepth + 1).fill(0);
  for (const d of Object.values(depth)) widthByLevel[d]++;
  const maxBreadth = Math.max(...widthByLevel);
  return maxDepth >= maxBreadth ? "layered-right" : "layered-down";
}

// ── chooseSides (mirrors elkAdapter.ts) ──────────────────────────────────────
// Dominant-axis rule: always picks a direct (same-axis) side pair so every
// edge is a straight line from side-center to side-center.
function chooseSides(src, tgt) {
  const dx = (tgt.x + tgt.width / 2) - (src.x + src.width / 2);
  const dy = (tgt.y + tgt.height / 2) - (src.y + src.height / 2);
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy >= 0 ? { s: "bottom", t: "top" } : { s: "top", t: "bottom" };
  }
  return dx > 0 ? { s: "right", t: "left" } : { s: "left", t: "right" };
}

// ── assignSlots (slot=0 always since SLOTS_PER_SIDE=1) ───────────────────────
function assignHandles(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return edges.map(e => {
    const src = byId.get(e.source), tgt = byId.get(e.target);
    if (!src || !tgt) return e;
    const { s, t } = chooseSides(src, tgt);
    return { ...e, sourceHandle: `src-${s}-0`, targetHandle: `tgt-${t}-0` };
  });
}

// ── Text measurement (mirrors measureText.ts) ─────────────────────────────────
const MONO_RATIO = 0.6;
function measureText(text, opts) {
  const { maxWidth, minWidth, fontSize, lineHeight, paddingX, paddingY } = opts;
  const innerMax = Math.max(1, maxWidth - paddingX);
  const cw = fontSize * MONO_RATIO;
  const maxCharsPerLine = Math.max(1, Math.floor(innerMax / cw));
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if (w.length > maxCharsPerLine) {
      if (cur) { lines.push(cur); cur = ""; }
      let rem = w;
      while (rem.length > maxCharsPerLine) { lines.push(rem.slice(0, maxCharsPerLine)); rem = rem.slice(maxCharsPerLine); }
      cur = rem; continue;
    }
    const cand = cur.length === 0 ? w : `${cur} ${w}`;
    if (cand.length <= maxCharsPerLine) cur = cand;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const nLines = lines.length || 1;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const contentW = Math.ceil(longest * cw);
  const width = Math.min(maxWidth, Math.max(minWidth, contentW + paddingX));
  const height = Math.ceil(nLines * fontSize * lineHeight) + paddingY;
  return { width, height };
}

const FRAME_FONT = { maxWidth: 340, minWidth: 220, fontSize: 16, lineHeight: 1.5, paddingX: 64, paddingY: 64 };
const LABEL_FONT = { maxWidth: 220, minWidth: 24, fontSize: 12, lineHeight: 1.4, paddingX: 16, paddingY: 16 };
const FRAME_ORIGIN = { x: 80, y: 80 };

// ── ELK call ─────────────────────────────────────────────────────────────────
function runElk(graph) {
  return new Promise((resolve, reject) => {
    const child = execFile("node", [WORKER], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { reject(new Error(`ELK: ${err.message}\n${stderr}`)); return; }
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error(`ELK parse: ${stderr}`)); }
    });
    child.stdin.write(JSON.stringify(graph));
    child.stdin.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const map = JSON.parse(readFileSync(FIXTURE, "utf8"));
  console.log(`Reformatting: ${map.title || map.id}`);

  for (const [frameId, frame] of Object.entries(map.frames)) {
    const nodeIds = frame.nodeInstances.map(ni => ni.nodeId);
    const edges = frame.edges;

    // Measure node sizes
    const sizes = {};
    for (const nodeId of nodeIds) {
      const text = map.nodes[nodeId]?.text || "";
      sizes[nodeId] = measureText(text, FRAME_FONT);
    }

    const elkNodes = nodeIds.map(id => ({ id, width: sizes[id].width, height: sizes[id].height }));
    const elkEdges = edges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      ...(e.label ? { labels: [{ text: e.label, ...measureText(e.label, LABEL_FONT) }] } : {}),
    }));

    const strategy = pickFrameStrategy(elkNodes, edges);

    const graph = {
      id: "root",
      layoutOptions: STRATEGIES[strategy],
      children: elkNodes,
      edges: elkEdges.map(e => ({ id: e.id, sources: [e.source], targets: [e.target], ...(e.labels ? { labels: e.labels } : {}) })),
    };

    let result;
    try {
      result = await runElk(graph);
    } catch (e) {
      console.error(`  frame ${frameId}: ELK error — ${e.message}`);
      continue;
    }

    const posById = {};
    for (const c of result.children || []) {
      posById[c.id] = { x: c.x + FRAME_ORIGIN.x, y: c.y + FRAME_ORIGIN.y, width: c.width, height: c.height };
    }

    // Update nodeInstances positions/sizes
    frame.nodeInstances = frame.nodeInstances.map(ni => ({
      ...ni,
      position: posById[ni.nodeId] ? { x: posById[ni.nodeId].x, y: posById[ni.nodeId].y } : ni.position,
      size: posById[ni.nodeId] ? { width: posById[ni.nodeId].width, height: posById[ni.nodeId].height } : ni.size,
    }));

    // Assign handles based on final positions
    const laidOutNodes = Object.entries(posById).map(([id, p]) => ({ id, ...p }));
    frame.edges = assignHandles(laidOutNodes, edges);

    console.log(`  frame ${frameId}: ${strategy} · ${nodeIds.length} nodes · ${edges.length} edges`);
  }

  writeFileSync(FIXTURE, JSON.stringify(map, null, 2) + "\n");
  console.log("Done.");
}

main().catch(e => { console.error(e); process.exit(1); });
