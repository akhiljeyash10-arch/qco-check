import Link from "next/link";

/**
 * Custom 404 page (Next.js `not-found.tsx`).
 *
 * Replaces the default Next.js 404 with a clean page that matches the
 * enterprise UI. Rendered when `notFound()` is called or when no route matches.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-6 py-24">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500">
          404
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900">
          Page not found
        </h1>
        <p className="text-sm leading-relaxed text-zinc-500">
          The page you&apos;re looking for doesn&apos;t exist or has been
          moved. Check the URL or navigate back to safety.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Go home
          </Link>
          <Link
            href="/sign-in"
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
