import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: "view" | "edit";
};

export type Mode = "view" | "edit";

const COLORS = ["#cdf4d3", "#ffc2ec", "#c2e5ff", "#dcccff"];

export function avatarFor(user: AppUser) {
  const initials = user.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");
  let h = 0;
  for (let i = 0; i < user.id.length; i++)
    h = (h * 31 + user.id.charCodeAt(i)) >>> 0;
  return { initials: initials || "?", color: COLORS[h % COLORS.length]! };
}

const DEV_USER: AppUser = {
  id: "dev-john",
  email: "john@media.mit.edu",
  displayName: "John",
  role: "view",
};

// Returns the signed-in app user, or null if no session.
// The proxy gates pages so most callers can assume non-null; defensive null still helps server-actions.
export async function currentUser(): Promise<AppUser | null> {
  if (process.env.SKIP_AUTH === "true") return DEV_USER;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: row } = await supabase
    .from("Dialectica_users")
    .select("id, email, display_name, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!row) {
    // Trigger may not have fired yet in edge cases (e.g. seeded auth user without app row).
    // Backfill the row via admin client so FKs to Dialectica_users(id) (stakes, annotations) succeed.
    const email = user.email ?? "";
    const displayName =
      (user.user_metadata?.display_name as string | undefined) ??
      email.split("@")[0] ??
      "user";
    const role = email === "mpholsch@media.mit.edu" ? "edit" : "view";
    const admin = createSupabaseAdminClient();
    const { data: inserted, error: insertErr } = await admin
      .from("Dialectica_users")
      .upsert(
        { id: user.id, email, display_name: displayName, role },
        { onConflict: "id" },
      )
      .select("id, email, display_name, role")
      .single();
    if (insertErr || !inserted) {
      return { id: user.id, email, displayName, role: "view" };
    }
    return {
      id: inserted.id,
      email: inserted.email,
      displayName: inserted.display_name,
      role: inserted.role,
    };
  }

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

export async function currentMode(): Promise<Mode> {
  const user = await currentUser();
  return user?.role === "edit" ? "edit" : "view";
}
