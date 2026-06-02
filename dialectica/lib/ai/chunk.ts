// Overlapping-chunk splitter for long transcripts. No-op when the input fits.
//
// Per ROADMAP Phase 7 — long transcripts: Stage 1 runs per chunk; Stage 2 is
// the chunk-stitching mechanism (restatements across chunk boundaries collapse
// during dedup). No separate merge step.

const DEFAULT_CHUNK_CHARS = 18_000; // ~4.5k tokens — safe for any modern context.
const DEFAULT_OVERLAP_CHARS = 1_200;

export type ChunkOptions = {
  chunkChars?: number;
  overlapChars?: number;
};

export function chunkTranscript(
  transcript: string,
  opts: ChunkOptions = {},
): string[] {
  const chunkChars = opts.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const overlapChars = opts.overlapChars ?? DEFAULT_OVERLAP_CHARS;
  const text = transcript.trim();
  if (text.length <= chunkChars) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + chunkChars);
    let cut = end;
    // Prefer to break on a paragraph or sentence boundary inside the window.
    if (end < text.length) {
      const slice = text.slice(start, end);
      const paragraphBreak = slice.lastIndexOf("\n\n");
      const sentenceBreak = Math.max(
        slice.lastIndexOf(". "),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! "),
      );
      if (paragraphBreak > chunkChars * 0.5) cut = start + paragraphBreak + 2;
      else if (sentenceBreak > chunkChars * 0.5) cut = start + sentenceBreak + 2;
    }
    chunks.push(text.slice(start, cut).trim());
    if (cut >= text.length) break;
    start = Math.max(0, cut - overlapChars);
  }
  return chunks;
}
