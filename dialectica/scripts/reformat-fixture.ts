/**
 * Re-run ELK auto-format directly on the local fixture file.
 * Updates node positions, sizes, and edge handles in-place.
 * Does NOT hit the API route (avoids the event-loop-blocking hang).
 *
 * Usage:
 *   node --import tsx scripts/reformat-fixture.ts
 *   node --import tsx scripts/reformat-fixture.ts layered-right
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import { autoFormatArgMap } from "@/lib/layout/autoFormatArgMap";
import type { LayoutStrategyId } from "@/lib/layout/strategies";

const FIXTURE_PATH = resolve(import.meta.dirname ?? __dirname, "../lib/fixtures/google-xi-test6.json");
const strategy = (process.argv[2] ?? "auto") as LayoutStrategyId | "auto";

async function main() {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  const map = JSON.parse(raw);
  console.log(`Reformatting fixture: ${map.title ?? map.id}`);
  const result = await autoFormatArgMap(
    map,
    strategy === "auto" ? undefined : strategy,
    (msg) => console.log(" ", msg),
  );
  writeFileSync(FIXTURE_PATH, JSON.stringify(result, null, 2) + "\n");
  console.log("Done — fixture updated.");
}

main().catch((err) => { console.error(err); process.exit(1); });
