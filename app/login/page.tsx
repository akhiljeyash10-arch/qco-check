import { redirect } from "next/navigation";

/**
 * Convenience redirect: /login → /sign-in.
 *
 * The canonical auth route is /sign-in (referenced by auth.config.ts
 * `pages.signIn`). This alias exists so both URLs work.
 */
export default function LoginPage() {
  redirect("/sign-in");
}
