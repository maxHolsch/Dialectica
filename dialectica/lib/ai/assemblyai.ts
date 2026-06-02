import { AssemblyAI } from "assemblyai";

// AssemblyAI integration per PRD §7.1 — audio (`.m4a`, etc.) → transcript.
//
// The workflow layer calls `transcribeAudioUrl` inside a step. AssemblyAI's
// `client.transcripts.transcribe()` polls until completion and returns the
// final transcript, so we don't need to manually wire job polling here.
//
// Failure modes (bad audio, partial transcription) bubble up as thrown errors,
// which the workflow step turns into a retry → eventually a `failed` status on
// the run row (surfaced on the admin page per PRD §7.1).

let _client: AssemblyAI | null = null;

function client(): AssemblyAI {
  if (_client) return _client;
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Add it to .env.local (and Vercel project settings) before running audio generations.",
    );
  }
  _client = new AssemblyAI({ apiKey });
  return _client;
}

export async function transcribeAudioUrl(audioUrl: string): Promise<string> {
  const transcript = await client().transcripts.transcribe({
    audio: audioUrl,
  });
  if (transcript.status === "error") {
    throw new Error(
      `AssemblyAI transcription failed: ${transcript.error ?? "unknown error"}`,
    );
  }
  const text = transcript.text;
  if (!text || text.trim().length === 0) {
    throw new Error(
      "AssemblyAI returned an empty transcript — likely silent or unintelligible audio.",
    );
  }
  return text;
}
