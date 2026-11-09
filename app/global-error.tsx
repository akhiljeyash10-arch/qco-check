"use client";

import { useEffect } from "react";

/**
 * Global error boundary (Next.js App Router).
 *
 * Replaces the root layout entirely when an error escapes it, so it must
 * render its own <html> + <body>. This catches catastrophic failures that
 * error.tsx cannot (e.g. an error thrown by the root layout itself).
 *
 * In production, raw error messages are never surfaced to the client.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6">
        <div className="flex max-w-md flex-col gap-4 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Application error
          </h1>
          <p className="text-sm leading-relaxed text-zinc-600">
            {isDev
              ? error.message || "An unexpected error occurred."
              : "An unexpected error occurred. Please try again, or contact support if the problem persists."}
          </p>
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex items-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
