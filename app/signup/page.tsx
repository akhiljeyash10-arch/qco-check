import Link from "next/link";
import { safeAuth } from "@/lib/safe-auth";
import { redirect } from "next/navigation";
import { SignUpForm } from "./SignUpForm";

export const dynamic = "force-dynamic";

/**
 * Self-serve sign-up page for new Importers / CHAs.
 *
 * Already-authenticated visitors are redirected home (middleware enforces this
 * too). Uses `safeAuth` so a stale JWT cookie doesn't crash the page.
 */
export default async function SignUpPage() {
  const session = await safeAuth();
  if (session?.user) redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Create your QCO-Check account
          </h1>
          <p className="text-sm text-zinc-600">
            Register your firm to start running BIS compliance checks.
          </p>
        </div>
        <SignUpForm />
        <p className="text-center text-sm text-zinc-600">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="font-medium text-zinc-900 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
