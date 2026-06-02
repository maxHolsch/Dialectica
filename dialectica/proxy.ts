import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next.js 16 proxy (was middleware.ts in 15). Refreshes the Supabase session on
// every request, then bounces unauthenticated users to /sign-in. Signed-in users
// hitting /sign-in get sent home.
export async function proxy(request: NextRequest) {
  const { response, user } = await updateSession(request);
  const { pathname } = request.nextUrl;

  const isAuthRoute =
    pathname.startsWith("/sign-in") || pathname.startsWith("/auth/");
  // Workflow DevKit talks to its own /.well-known/workflow/* endpoints from
  // step/workflow callbacks — never gate or redirect those.
  const isWorkflowInternal = pathname.startsWith("/.well-known/workflow/");

  if (!user && !isAuthRoute && !isWorkflowInternal) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && pathname === "/sign-in") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.delete("next");
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next.js internals + static asset filenames + Workflow DevKit's
    // internal endpoints. Run on everything else so the session cookie stays
    // fresh on every navigation.
    "/((?!_next/static|_next/image|favicon.ico|\\.well-known/workflow/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
