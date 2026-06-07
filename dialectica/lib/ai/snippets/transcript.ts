import "server-only";
import namedUtterances from "@/db/tetrad-utterances.named.json";

// Indexed, timestamped transcript for the snippet pipeline.
//
// The LLM picks the top-5 most-related utterances PER CLAIM by returning their
// stable ids (e.g. "U0042"). We then resolve those ids back to exact ms
// timestamps + named speaker via `lookup` — no fragile text matching. The ids
// agree with the audio recording because `db/tetrad-utterances.named.json` is
// the AssemblyAI "named" pass whose offsets match tetrad_room_recording.flac.

export type WordTiming = { text: string; start: number; end: number };

export type NamedUtterance = {
  speaker: string; // diarization label (A, B, …)
  speaker_name: string; // resolved identity
  text: string;
  start: number; // ms
  end: number; // ms
  words?: WordTiming[];
};

export type ResolvedUtterance = {
  id: string;
  startMs: number;
  endMs: number;
  speakerName: string;
  speakerLabel: string;
  text: string;
  // Per-word timings — used to trim long utterances to a word cap while
  // keeping the audio span aligned with the trimmed text.
  words: WordTiming[];
};

// "U" + zero-padded index keeps ids fixed-width and easy for the model to copy.
function utteranceId(index: number): string {
  return `U${String(index).padStart(4, "0")}`;
}

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

export type IndexedTranscript = {
  /** One line per utterance: `[U0042 | Andrew McLuhan | 2:01:14]: …text…` */
  text: string;
  /** id → resolved utterance (exact ms, named speaker, verbatim text). */
  lookup: Map<string, ResolvedUtterance>;
  utteranceCount: number;
};

/**
 * Build the indexed transcript + the id→utterance lookup from the named,
 * timestamped utterances. Pure (the import is module-constant), so it can be
 * called once per snippet job.
 */
export function buildIndexedTranscript(
  utterances: NamedUtterance[] = namedUtterances as NamedUtterance[],
): IndexedTranscript {
  const lookup = new Map<string, ResolvedUtterance>();
  const lines: string[] = [];

  utterances.forEach((u, i) => {
    const text = (u.text ?? "").trim();
    if (!text) return;
    const id = utteranceId(i);
    const speakerName = u.speaker_name || `Speaker ${u.speaker}`;
    lookup.set(id, {
      id,
      startMs: u.start,
      endMs: u.end,
      speakerName,
      speakerLabel: u.speaker,
      text,
      words: u.words ?? [],
    });
    lines.push(`[${id} | ${speakerName} | ${msToTimestamp(u.start)}]: ${text}`);
  });

  return { text: lines.join("\n"), lookup, utteranceCount: lookup.size };
}

/**
 * Trim an utterance to at most `maxWords`, keeping the audio span aligned with
 * the trimmed text by ending at the kept words' last timestamp. Appends an
 * ellipsis when truncated. Falls back to a proportional estimate if word
 * timings are missing.
 */
export function trimToWordCap(
  utt: ResolvedUtterance,
  maxWords: number,
): { text: string; endMs: number } {
  const words = utt.words;
  if (!words.length) {
    const tokens = utt.text.split(/\s+/).filter(Boolean);
    if (tokens.length <= maxWords) return { text: utt.text, endMs: utt.endMs };
    const frac = maxWords / tokens.length;
    return {
      text: tokens.slice(0, maxWords).join(" ") + "…",
      endMs: Math.round(utt.startMs + frac * (utt.endMs - utt.startMs)),
    };
  }
  if (words.length <= maxWords) return { text: utt.text, endMs: utt.endMs };
  const kept = words.slice(0, maxWords);
  return {
    text: kept.map((w) => w.text).join(" ") + "…",
    endMs: kept[kept.length - 1].end,
  };
}
