// Pure word-wrap text sizer. No DOM/canvas dependency so the same function
// runs inside the Vercel Workflow step (Node) and in the browser when the
// edit-mode AUTO-FORMAT button fires.
//
// Approach: the app uses a monospace font (Tailwind `font-mono`). For a typical
// monospace glyph, advance ≈ 0.60 × fontSize. That's accurate to within ~5–8%
// for the JetBrains/IBM Plex Mono stack we ship, which is fine because ELK
// reflows around whatever sizes we hand it.

export type MeasureOptions = {
  /** Hard cap; lines wrap before this width. */
  maxWidth: number;
  /** Floor so very-short text still produces a usable node. */
  minWidth: number;
  /** px. Matches the CSS font-size of the node text. */
  fontSize: number;
  /** Tailwind `leading-[X]` value, unitless multiplier of fontSize. */
  lineHeight: number;
  /** Horizontal padding inside the node (left + right combined). */
  paddingX: number;
  /** Vertical padding inside the node (top + bottom combined). */
  paddingY: number;
};

export type Measured = {
  width: number;
  height: number;
  lines: number;
};

const MONO_CHAR_WIDTH_RATIO = 0.6;

function charWidth(fontSize: number): number {
  return fontSize * MONO_CHAR_WIDTH_RATIO;
}

/**
 * Wrap text into lines that fit within (maxWidth - paddingX) at the given font.
 * Breaks on whitespace; for unbreakable tokens that exceed the inner width,
 * falls back to a hard char-level break so a long URL never explodes the box.
 */
function wrapToLines(
  text: string,
  innerWidth: number,
  fontSize: number,
): string[] {
  const cw = charWidth(fontSize);
  const maxCharsPerLine = Math.max(1, Math.floor(innerWidth / cw));
  if (!text) return [""];

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.length > 0) {
      lines.push(current);
      current = "";
    }
  };

  for (const rawWord of words) {
    // Hard-break a single word longer than the line. We slice it into chunks
    // so the rest of the wrapping still works.
    if (rawWord.length > maxCharsPerLine) {
      pushCurrent();
      let remaining = rawWord;
      while (remaining.length > maxCharsPerLine) {
        lines.push(remaining.slice(0, maxCharsPerLine));
        remaining = remaining.slice(maxCharsPerLine);
      }
      current = remaining;
      continue;
    }

    const candidate = current.length === 0 ? rawWord : `${current} ${rawWord}`;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      pushCurrent();
      current = rawWord;
    }
  }
  pushCurrent();
  return lines.length === 0 ? [""] : lines;
}

export function measureWrappedText(
  text: string,
  opts: MeasureOptions,
): Measured {
  const { maxWidth, minWidth, fontSize, lineHeight, paddingX, paddingY } = opts;
  const innerMax = Math.max(1, maxWidth - paddingX);
  const lines = wrapToLines(text, innerMax, fontSize);

  const cw = charWidth(fontSize);
  const longest = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const contentWidth = Math.ceil(longest * cw);
  const width = Math.min(
    maxWidth,
    Math.max(minWidth, contentWidth + paddingX),
  );

  const contentHeight = Math.ceil(lines.length * fontSize * lineHeight);
  const height = contentHeight + paddingY;

  return { width, height, lines: lines.length };
}
