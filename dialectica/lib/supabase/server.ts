import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Auth-aware Supabase client for Server Components / Server Actions / Route Handlers.
// Use this anywhere we need to read the signed-in user or hit the DB with their RLS context.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component context can't mutate cookies — the proxy refreshes the session instead.
          }
        },
      },
    },
  );
}
