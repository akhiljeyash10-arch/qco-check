"use client";

import { useActionState } from "react";
import { register } from "@/lib/auth-actions";
import { PasswordInput } from "@/components/PasswordInput";

/**
 * Self-serve registration form. Collects firm name, full name, email, and
 * password, then calls the `register` server action which creates the Firm +
 * User and auto-signs-in. Uses React 19 `useActionState` for inline error
 * rendering.
 */
export function SignUpForm() {
  const [state, formAction, pending] = useActionState(register, undefined);

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="firmName" className="text-sm font-medium text-zinc-700">
          Firm name
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="firmName"
          name="firmName"
          type="text"
          autoComplete="organization"
          required
          aria-required="true"
          className="rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {state?.fieldErrors?.firmName ? (
          <p role="alert" className="text-sm text-red-600">
            {state.fieldErrors.firmName}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="fullName" className="text-sm font-medium text-zinc-700">
          Full name
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          aria-required="true"
          className="rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {state?.fieldErrors?.fullName ? (
          <p role="alert" className="text-sm text-red-600">
            {state.fieldErrors.fullName}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium text-zinc-700">
          Email
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-required="true"
          className="rounded border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
        />
        {state?.fieldErrors?.email ? (
          <p role="alert" className="text-sm text-red-600">
            {state.fieldErrors.email}
          </p>
        ) : null}
      </div>
      <PasswordInput
        id="password"
        name="password"
        label="Password"
        autoComplete="new-password"
        required
        minLength={8}
      />
      {state?.fieldErrors?.password ? (
        <p role="alert" className="text-sm text-red-600">
          {state.fieldErrors.password}
        </p>
      ) : (
        <p className="text-xs text-zinc-400">At least 8 characters.</p>
      )}
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
        {pending ? "Creating account…" : "Create account"}
      </button>
    </form>
  );
}
