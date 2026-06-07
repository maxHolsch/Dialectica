#!/usr/bin/env node
/**
 * Apply ELK auto-format directly to a map in Supabase.
 * Pure CJS — no tsx, no execFile-over-tsx hang.
 *
 * Usage:
 *   node --env-file=.env.local scripts/reformat-supabase.cjs [mapId]
 *
 * Defaults to Test7: map-gen-nyiz0g-mpzuxlzq
 */
"use strict";

const { execFile } = require("child_process");
const { resolve } = require("path");
const { createClient } = require("@supabase/supabase-js");

const MAP_ID = process.argv[2] || "map-gen-nyiz0g-mpzuxlzq";
const WORKER = resolve(__dirname, "../lib/layout/elk-worker.cjs");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// ── ELK strategy options ──────────────────────────────────────────────────────
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

// ── pickFrameStrategy ─────────────────────────────────────────────────────────
function pickFrameStrategy(nodes, edges) {
  if (nodes.length <= 1) return "layered-down";
  const inDegree = {}, adj = {};
  for (const n of nodes) { inDegree[n.id] = 0; adj[n.id] = []; }
  for (const e of edges) {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    (adj[e.source] = adj[e.source] || []).push(e.target);
  }
  const depth = {};
  for (const n of nodes) depth[n.id] = 0;
  const queue = nodes.filter(n => !inDegree[n.id]).map(n => n.id);
  const maxIter = nodes.length * nodes.length;
  for (let i = 0; i < queue.length && i < maxIter; i++) {
    for (const nxt of adj[queue[i]] || []) {
      const d = (depth[queue[i]] || 0) + 1;
      if (d > (depth[nxt] || 0)) { depth[nxt] = d; queue.push(nxt); }
    }
  }
  const maxDepth = Math.max(...Object.values(depth));
  const wb = new Array(maxDepth + 1).fill(0);
  for (const d of Object.values(depth)) wb[d]++;
  return maxDepth >= Math.max(...wb) ? "layered-right" : "layered-down";
}

// ── chooseSides ───────────────────────────────────────────────────────────────
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

function assignHandles(nodes, edges) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  return edges.map(e => {
    const src = byId.get(e.source), tgt = byId.get(e.target);
    if (!src || !tgt) return e;
    const { s, t } = chooseSides(src, tgt);
    return { ...e, sourceHandle: `src-${s}-0`, targetHandle: `tgt-${t}-0` };
  });
}

// ── Text measurement ──────────────────────────────────────────────────────────
function measureText(text, { maxWidth, minWidth, fontSize, lineHeight, paddingX, paddingY }) {
  const cw = fontSize * 0.6;
  const maxC = Math.max(1, Math.floor((maxWidth - paddingX) / cw));
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines = []; let cur = "";
  for (const w of words) {
    if (w.length > maxC) {
      if (cur) { lines.push(cur); cur = ""; }
      let r = w;
      while (r.length > maxC) { lines.push(r.slice(0, maxC)); r = r.slice(maxC); }
      cur = r; continue;
    }
    const c = cur ? `${cur} ${w}` : w;
    if (c.length <= maxC) cur = c;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const n = lines.length || 1;
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  return {
    width: Math.min(maxWidth, Math.max(minWidth, Math.ceil(longest * cw) + paddingX)),
    height: Math.ceil(n * fontSize * lineHeight) + paddingY,
  };
}

const FRAME_FONT = { maxWidth: 340, minWidth: 220, fontSize: 16, lineHeight: 1.5, paddingX: 64, paddingY: 64 };
const LABEL_FONT = { maxWidth: 220, minWidth: 24, fontSize: 12, lineHeight: 1.4, paddingX: 16, paddingY: 16 };
const FRAME_ORIGIN = { x: 80, y: 80 };

// ── ELK ───────────────────────────────────────────────────────────────────────
function runElk(graph) {
  return new Promise((res, rej) => {
    const child = execFile("node", [WORKER], { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, out) => {
      if (err) { rej(new Error(err.message)); return; }
      try { res(JSON.parse(out)); } catch (e) { rej(e); }
    });
    child.stdin.write(JSON.stringify(graph));
    child.stdin.end();
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Loading map ${MAP_ID} from Supabase...`);
  const { data, error } = await supabase.from("Dialectica_maps").select("data").eq("id", MAP_ID).maybeSingle();
  if (error) { console.error("Supabase error:", error.message); process.exit(1); }
  if (!data) { console.error("Map not found:", MAP_ID); process.exit(1); }

  const map = data.data;
  console.log(`Map: ${map.title || map.id} — ${Object.keys(map.frames || {}).length} frames`);

  for (const [frameId, frame] of Object.entries(map.frames || {})) {
    const nodeIds = frame.nodeInstances.map(ni => ni.nodeId);
    const sizes = {};
    for (const id of nodeIds) sizes[id] = measureText(map.nodes[id]?.text || "", FRAME_FONT);

    const elkNodes = nodeIds.map(id => ({ id, ...sizes[id] }));
    const strategy = pickFrameStrategy(elkNodes, frame.edges);

    const graph = {
      id: "root",
      layoutOptions: STRATEGIES[strategy],
      children: elkNodes,
      edges: frame.edges.map(e => ({
        id: e.id, sources: [e.source], targets: [e.target],
        ...(e.label ? { labels: [{ text: e.label, ...measureText(e.label, LABEL_FONT) }] } : {}),
      })),
    };

    let result;
    try { result = await runElk(graph); }
    catch (e) { console.error(`  frame ${frameId}: ELK error — ${e.message}`); continue; }

    const posById = {};
    for (const c of result.children || []) {
      posById[c.id] = { x: c.x + FRAME_ORIGIN.x, y: c.y + FRAME_ORIGIN.y, width: c.width, height: c.height };
    }

    frame.nodeInstances = frame.nodeInstances.map(ni => ({
      ...ni,
      position: posById[ni.nodeId] ? { x: posById[ni.nodeId].x, y: posById[ni.nodeId].y } : ni.position,
      size: posById[ni.nodeId] ? { width: posById[ni.nodeId].width, height: posById[ni.nodeId].height } : ni.size,
    }));

    const laidOutNodes = Object.entries(posById).map(([id, p]) => ({ id, ...p }));
    frame.edges = assignHandles(laidOutNodes, frame.edges);

    console.log(`  frame ${frameId}: ${strategy}`);
  }

  map.updatedAt = new Date().toISOString();
  const { error: saveErr } = await supabase
    .from("Dialectica_maps")
    .update({ data: map, updated_at: map.updatedAt })
    .eq("id", MAP_ID);

  if (saveErr) { console.error("Save error:", saveErr.message); process.exit(1); }
  console.log("Saved to Supabase. Reload the browser.");
}

main().catch(e => { console.error(e); process.exit(1); });
