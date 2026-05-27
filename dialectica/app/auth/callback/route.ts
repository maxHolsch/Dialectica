import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Supabase magic-link redirects here with ?code=... (PKCE).
// We exchange it for a session cookie, then bounce to the originally-requested page.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errUrl = new URL(`/sign-in?error=${encodeURIComponent(error.message)}`, url);
      return NextResponse.redirect(errUrl);
    }
  }

  return NextResponse.redirect(new URL(safeNext, url));
}
