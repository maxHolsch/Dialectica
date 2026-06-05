/**
 * Converts tetrad-utterances.json to a labeled plain-text transcript
 * suitable for pasting into the admin generation form.
 *
 * Usage:
 *   node --import tsx scripts/convert-transcript.ts > /tmp/tetrad-transcript.txt
 *   node --import tsx scripts/convert-transcript.ts --preview   # print first 50 lines
 */

import utterances from "../db/tetrad-utterances.json" assert { type: "json" };

type Utterance = { speaker: string; text: string; start: number };

function msToTimestamp(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function convertTranscript(data: Utterance[]): string {
  return data
    .filter((u) => u.text.trim().length > 0)
    .map((u) => `[Speaker ${u.speaker} ${msToTimestamp(u.start)}]: ${u.text.trim()}`)
    .join("\n");
}

const text = convertTranscript(utterances as Utterance[]);

if (process.argv.includes("--preview")) {
  const lines = text.split("\n").slice(0, 50);
  process.stderr.write(`Total chars: ${text.length.toLocaleString()}\n`);
  process.stderr.write(`Total lines: ${text.split("\n").length.toLocaleString()}\n`);
  process.stdout.write(lines.join("\n") + "\n");
} else {
  process.stdout.write(text);
}
