import { safeAuth } from "@/lib/safe-auth";
import { redirect } from "next/navigation";
import { SignInForm } from "./SignInForm";

export const dynamic = "force-dynamic";

/**
 * Sign-in page. Already-authenticated visitors are sent home (which routes
 * them to their role's area); middleware enforces this too, so this guard is
 * defense-in-depth. Uses `safeAuth` so a stale JWT cookie doesn't crash the
 * page.
 *
 * Both regular users and platform admins sign in here. After login the home
 * page routes admins to `/rules` and users to `/determinations`.
 */
export default async function SignInPage() {
  const session = await safeAuth();
  if (session?.user?.role === "ADMIN") redirect("/rules");
  if (session?.user?.role === "USER") redirect("/determinations");

  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col gap-1.5 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Sign in to QCO-Check
          </h1>
          <p className="text-sm text-zinc-600">
            BIS Product Compliance Applicability Engine
          </p>
        </div>
        <SignInForm />
        <p className="text-center text-xs text-zinc-400">
          Platform admins sign in with the same form.
        </p>
      </div>
    </main>
  );
}
