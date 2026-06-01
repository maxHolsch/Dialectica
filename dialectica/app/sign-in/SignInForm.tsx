"use client";

import { useActionState } from "react";
import { sendMagicLink, signInAsDev, type SignInState } from "./actions";

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<SignInState, FormData>(
    sendMagicLink,
    { status: "idle" },
  );
  const [devState, devAction, devPending] = useActionState<SignInState, FormData>(
    signInAsDev,
    { status: "idle" },
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-lg border border-dia-border bg-dia-surface p-6 font-mono text-[13px] text-dia-fg-muted">
        <p className="text-dia-mint">Check your email.</p>
        <p className="mt-2 text-dia-fg-dim">
          We sent a sign-in link to <span className="text-dia-fg">{state.email}</span>.
          Open it on this device to finish signing in.
        </p>
      </div>
    );
  }

  return (
    <>
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-dia-fg-dim">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          className="mt-1 block h-11 w-full rounded-md border border-dia-border-strong bg-dia-bg px-3 font-mono text-[13px] text-dia-fg placeholder:text-dia-fg-dim outline-none focus:border-dia-mint"
        />
      </label>
      <label className="block">
        <span className="font-mono text-[11px] uppercase tracking-[1.2px] text-dia-fg-dim">
          Display name
        </span>
        <input
          name="display_name"
          type="text"
          required
          maxLength={40}
          placeholder="e.g. Max H."
          className="mt-1 block h-11 w-full rounded-md border border-dia-border-strong bg-dia-bg px-3 font-mono text-[13px] text-dia-fg placeholder:text-dia-fg-dim outline-none focus:border-dia-mint"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center rounded-full bg-dia-mint font-mono text-[13px] font-bold tracking-[0.52px] text-black disabled:opacity-60"
      >
        {pending ? "Sending…" : "SEND MAGIC LINK"}
      </button>
      {state.status === "error" && (
        <p className="font-mono text-[12px] text-dia-pink">{state.message}</p>
      )}

      <div className="mt-6 border-t border-dia-border pt-4">
        <p className="font-mono text-[11px] uppercase tracking-[1.2px] text-dia-fg-dim">
          Dev shortcut
        </p>
        <button
          type="submit"
          form="dev-sign-in-max"
          disabled={devPending}
          className="mt-2 flex h-9 w-full items-center justify-center rounded-full border border-dia-border-strong bg-dia-bg font-mono text-[12px] text-dia-fg disabled:opacity-60"
        >
          {devPending ? "Signing in…" : "Sign in as Max (mpholsch@media.mit.edu)"}
        </button>
        <button
          type="submit"
          form="dev-sign-in-john"
          disabled={devPending}
          className="mt-2 flex h-9 w-full items-center justify-center rounded-full border border-dia-border-strong bg-dia-bg font-mono text-[12px] text-dia-fg disabled:opacity-60"
        >
          {devPending ? "Signing in…" : "Sign in as John (john@media.mit.edu)"}
        </button>
        {devState.status === "error" && (
          <p className="mt-2 font-mono text-[12px] text-dia-pink">{devState.message}</p>
        )}
      </div>
    </form>
    <form id="dev-sign-in-max" action={devAction}>
      <input type="hidden" name="email" value="mpholsch@media.mit.edu" />
      <input type="hidden" name="next" value={next} />
    </form>
    <form id="dev-sign-in-john" action={devAction}>
      <input type="hidden" name="email" value="john@media.mit.edu" />
      <input type="hidden" name="next" value={next} />
    </form>
    </>
  );
}
