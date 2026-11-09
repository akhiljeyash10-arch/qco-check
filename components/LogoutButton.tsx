"use client";

import { logout } from "@/lib/auth-actions";

/**
 * Sign-out control. Binds the `logout` server action to a form so it works
 * without client JavaScript enabled (progressive enhancement) and stays a
 * client component only because it references a server action in markup.
 */
export function LogoutButton() {
  return (
    <form action={logout}>
      <button
        type="submit"
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors motion-reduce:transition-none hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
      >
        Sign out
      </button>
    </form>
  );
}
