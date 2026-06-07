"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";

// Plays ONE snippet region of a single recording file: seeks to startMs and
// auto-stops at endMs (no per-snippet audio cutting). Range requests mean the
// browser only fetches the bytes around the region when it seeks.

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function SnippetAudioPlayer({
  src,
  startMs,
  endMs,
  tint,
}: {
  src: string | null;
  startMs: number;
  endMs: number;
  tint?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 within the region
  const startS = startMs / 1000;
  const endS = endMs / 1000;
  const durS = Math.max(0.001, endS - startS);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) a.pause();
    setPlaying(false);
  }, []);

  const onTimeUpdate = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.currentTime >= endS) {
      a.pause();
      a.currentTime = startS;
      setPlaying(false);
      setProgress(0);
      return;
    }
    setProgress(Math.min(1, Math.max(0, (a.currentTime - startS) / durS)));
  }, [endS, startS, durS]);

  // Pause if this component unmounts (e.g. drawer closes) so audio never
  // keeps playing in the background.
  useEffect(() => () => stop(), [stop]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    // Seek into the region (start, or current position if already inside it).
    if (a.currentTime < startS || a.currentTime >= endS) {
      a.currentTime = startS;
    }
    void a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [playing, src, startS, endS]);

  const tintStyle = tint
    ? {
        button: { backgroundColor: `${tint}26`, color: tint },
        track: { backgroundColor: `${tint}33` },
        fill: { backgroundColor: tint },
        label: { color: tint, opacity: 0.75 },
      }
    : null;

  if (!src) {
    return (
      <p
        className="font-mono text-[10px] uppercase tracking-[1px] text-dia-fg-dim"
        style={tintStyle?.label}
      >
        audio unavailable
      </p>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onTimeUpdate={onTimeUpdate}
        onEnded={stop}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause snippet" : "Play snippet"}
        className={
          tint
            ? "flex size-8 shrink-0 items-center justify-center rounded-full transition-opacity hover:opacity-80"
            : "flex size-8 shrink-0 items-center justify-center rounded-full bg-dia-surface-2 text-dia-fg transition-colors hover:bg-dia-mint hover:text-black"
        }
        style={tintStyle?.button}
      >
        {playing ? (
          <Pause className="size-3.5" strokeWidth={1.5} />
        ) : (
          <Play className="size-3.5 translate-x-[1px]" strokeWidth={1.5} />
        )}
      </button>
      <div
        className={
          tint
            ? "h-1 flex-1 overflow-hidden rounded-full"
            : "h-1 flex-1 overflow-hidden rounded-full bg-dia-surface-2"
        }
        style={tintStyle?.track}
      >
        <div
          className={
            tint
              ? "h-full transition-[width] duration-100"
              : "h-full bg-dia-mint transition-[width] duration-100"
          }
          style={{ width: `${progress * 100}%`, ...(tintStyle?.fill ?? {}) }}
        />
      </div>
      <span
        className="shrink-0 font-mono text-[10px] tabular-nums text-dia-fg-dim"
        style={tintStyle?.label}
      >
        {clock(endMs - startMs)}
      </span>
    </div>
  );
}
