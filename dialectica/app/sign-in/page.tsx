import { SignInForm } from "./SignInForm";

// PRD §6.6 — email + display_name signup, no SSO. Phase 2 uses Supabase magic-link OTP.

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") ? next : "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-dia-bg px-6">
      <div className="w-full max-w-[400px]">
        <h1 className="font-mono text-[20px] font-bold tracking-[0.8px] text-dia-fg">
          DIALECTIA
        </h1>
        <p className="mt-1 font-mono text-[13px] text-dia-fg-dim">
          Sign in or create an account.
        </p>
        <div className="mt-8">
          <SignInForm next={safeNext} />
        </div>
      </div>
    </main>
  );
}
