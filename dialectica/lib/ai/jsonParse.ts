// Tolerant JSON parser used between every pipeline stage.
//
// Models sometimes emit fenced code blocks (```json ... ```), prose preamble,
// or trailing commentary even when the prompt demands raw JSON. We strip the
// obvious wrappers, parse, and on failure call a `retry` callback that is
// expected to re-ask the model with a "return only JSON" reminder. A second
// failure throws with the offending text included so the caller can persist it
// for inspection (per ROADMAP Phase 7 — fail loudly with raw text saved to blob).

function stripFences(s: string): string {
  let t = s.trim();
  // ```json ... ``` or ``` ... ```
  const fence = /^```(?:json|JSON)?\s*([\s\S]*?)\s*```$/m;
  const m = t.match(fence);
  if (m) t = m[1]!.trim();
  // Sometimes models leave a leading "Here is the JSON:" line.
  const firstBrace = t.indexOf("{");
  const firstBracket = t.indexOf("[");
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket);
  if (start > 0) t = t.slice(start);
  // And matching trailing prose after the closing brace/bracket.
  const lastBrace = t.lastIndexOf("}");
  const lastBracket = t.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);
  if (end > -1 && end < t.length - 1) t = t.slice(0, end + 1);
  return t;
}

export class PipelineJsonError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = "PipelineJsonError";
  }
}

export async function tolerantJsonParse<T>(
  rawText: string,
  retry?: () => Promise<string>,
): Promise<T> {
  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(stripFences(s)) as T;
    } catch {
      return null;
    }
  };

  const first = tryParse(rawText);
  if (first !== null) return first;

  if (!retry) {
    throw new PipelineJsonError(
      "Pipeline stage returned invalid JSON (no retry callback supplied).",
      rawText,
    );
  }

  const second = await retry();
  const parsed = tryParse(second);
  if (parsed !== null) return parsed;

  throw new PipelineJsonError(
    "Pipeline stage returned invalid JSON after retry. Raw text preserved in error.",
    second,
  );
}
