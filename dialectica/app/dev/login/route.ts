import { NextResponse, type NextRequest } from "next/server";

// Dev-only user switcher. Only active when SKIP_AUTH=true.
// Usage: /dev/login?user=max  or  /dev/login?user=john
export async function GET(request: NextRequest) {
  if (process.env.SKIP_AUTH !== "true") {
    return NextResponse.json({ error: "not available" }, { status: 404 });
  }
  const user = request.nextUrl.searchParams.get("user") ?? "john";
  const redirectTo = request.nextUrl.searchParams.get("next") ?? "/";
  const response = NextResponse.redirect(new URL(redirectTo, request.url));
  response.cookies.set("dev_user", user, { path: "/", httpOnly: true });
  return response;
}
