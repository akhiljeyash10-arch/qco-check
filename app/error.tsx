"use client";

import { useEffect } from "react";

/**
 * Root error boundary (Next.js App Router).
 *
 * Catches unhandled errors in any route segment — most commonly a Prisma
 * `PrismaClientInitializationError` when the PostgreSQL database isn't
 * reachable. Instead of a raw stack trace, the user sees a friendly message
 * with a "Try again" button that re-renders the segment.
 *
 * In production, raw error messages are never surfaced to the client — only
 * a generic message is shown. The full error is logged server-side.
 */
export default function Error({
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

  const isDbError =
    error.message.includes("Can't reach database") ||
    error.message.includes("database server") ||
    error.name === "PrismaClientInitializationError";

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-16">
      <div className="flex max-w-md flex-col gap-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          {isDbError ? "Database unavailable" : "Something went wrong"}
        </h1>
        <p className="text-sm leading-relaxed text-zinc-600">
          {isDbError
            ? "The application can't connect to its database. Please try again in a moment, or contact support if the problem persists."
            : isDev
              ? error.message ||
                "An unexpected error occurred. Please try again."
              : "An unexpected error occurred. Please try again, or contact support if the problem persists."}
        </p>
        {isDev && error.digest && (
          <p className="text-xs text-zinc-400">Error digest: {error.digest}</p>
        )}
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
    </div>
  );
}
