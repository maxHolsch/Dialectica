"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

export async function sendMagicLink(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const next = String(formData.get("next") ?? "/");

  if (!email) return { status: "error", message: "Email is required." };
  if (!displayName)
    return { status: "error", message: "Display name is required." };

  const supabase = await createSupabaseServerClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { status: "error", message: error.message };
  return { status: "sent", email };
}

// Dev shortcut — log in as a known user without an email round-trip.
// Allowlisted emails only. Remove before production hardening; see ROADMAP Phase 11.
const DEV_USERS: Record<string, { display_name: string }> = {
  "mpholsch@media.mit.edu": { display_name: "Max H." },
  "john@media.mit.edu": { display_name: "John" },
};

export async function signInAsDev(
  _prev: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = String(formData.get("next") ?? "/");
  const safeNext = next.startsWith("/") ? next : "/";

  const profile = DEV_USERS[email];
  if (!profile) return { status: "error", message: "Email not in dev allowlist." };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { data: { display_name: profile.display_name } },
  });
  if (error || !data?.properties?.hashed_token) {
    return { status: "error", message: error?.message ?? "Failed to generate dev link." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) return { status: "error", message: verifyError.message };

  redirect(safeNext);
}
