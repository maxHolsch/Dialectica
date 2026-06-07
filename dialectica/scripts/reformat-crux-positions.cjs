#!/usr/bin/env node
/**
 * Apply a 2-row crux grid (top-light, bottom-heavy) to a map in Supabase.
 * For n=8 tiles this produces the 3:5 layout.
 *
 * Usage:
 *   node --env-file=.env.local scripts/reformat-crux-positions.cjs [mapId]
 *
 * Defaults to Test7: map-gen-nyiz0g-mpzuxlzq
 */
"use strict";

const { createClient } = require("@supabase/supabase-js");

const MAP_ID = process.argv[2] || "map-gen-nyiz0g-mpzuxlzq";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const MIN_TILE = 220;
const TILE_GAP = 48;
const GRID_CENTER = { x: 800, y: 540 };

async function main() {
  const { data: row, error } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", MAP_ID)
    .maybeSingle();

  if (error || !row) {
    console.error("Failed to load map:", error?.message);
    process.exit(1);
  }

  const map = row.data;
  const cruxes = map.cruxes ?? [];
  const n = cruxes.length;
  console.log(`Map: ${MAP_ID}  |  cruxes: ${n}`);

  const cell = MIN_TILE + TILE_GAP;

  // 2-row layout for 6–9 tiles: ceil(n * 0.6) on bottom, rest on top.
  const useTwoRows = n >= 6 && n <= 9;
  const bottomCols = useTwoRows ? Math.ceil(n * 0.6) : Math.ceil(Math.sqrt(n));
  const topCols = useTwoRows ? n - bottomCols : 0;
  const cols = bottomCols;
  const rows = useTwoRows ? 2 : Math.ceil(n / cols);

  const gridW = cols * cell - TILE_GAP;
  const gridH = rows * cell - TILE_GAP;
  const startX = GRID_CENTER.x - gridW / 2;
  const startY = GRID_CENTER.y - gridH / 2;

  const updatedCruxes = cruxes.map((c, i) => {
    let row, colWithinRow, tilesInRow;
    if (useTwoRows) {
      row = i < topCols ? 0 : 1;
      colWithinRow = i < topCols ? i : i - topCols;
      tilesInRow = i < topCols ? topCols : bottomCols;
    } else {
      row = Math.floor(i / cols);
      colWithinRow = i % cols;
      tilesInRow = row === rows - 1 ? n - row * cols : cols;
    }
    const rowInset = ((cols - tilesInRow) * cell) / 2;
    const pos = {
      x: startX + colWithinRow * cell + rowInset,
      y: startY + row * cell,
    };
    console.log(`  [${i}] ${c.id}  row=${row} col=${colWithinRow}  → (${Math.round(pos.x)}, ${Math.round(pos.y)})`);
    return { ...c, position: pos, size: { width: MIN_TILE, height: MIN_TILE } };
  });

  map.cruxes = updatedCruxes;
  map.updatedAt = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: map, updated_at: map.updatedAt })
    .eq("id", MAP_ID);

  if (updateError) {
    console.error("Update failed:", updateError.message);
    process.exit(1);
  }

  console.log(`\nDone — ${n} crux positions updated (${useTwoRows ? `${topCols}:${bottomCols}` : `${cols} cols`} layout).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
