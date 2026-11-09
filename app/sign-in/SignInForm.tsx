"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "@/lib/auth-actions";
import { PasswordInput } from "@/components/PasswordInput";

/**
 * Credentials sign-in form. Uses React 19 `useActionState` to bind the
 * `login` server action and render validation/credential errors inline.
 */
export function SignInForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>
      <PasswordInput
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        required
      />
      {state?.error ? (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-sm text-zinc-600">
        New importer or CHA?{" "}
        <Link
          href="/signup"
          className="font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}