import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getFirmForUser } from "@/lib/data-access";
import { CheckForm } from "./CheckForm";

export const dynamic = "force-dynamic";

/**
 * Single-check screen — the primary USER flow.
 *
 * Protected by the `(user)` layout (auth + USER role) and the middleware
 * (`/determinations/*`). The form posts to `/api/check` and renders a
 * Green/Red/Amber verdict with all references and the reasoning trace.
 */
export default async function CheckPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "USER") redirect("/rules");

  const firm = await getFirmForUser(user);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          Single Check
        </h1>
        <p className="text-sm text-zinc-600">
          Firm:{" "}
          <span className="font-medium text-zinc-900">
            {firm?.name ?? "Unknown"}
          </span>
        </p>
      </div>
      <CheckForm />
    </div>
  );
}
