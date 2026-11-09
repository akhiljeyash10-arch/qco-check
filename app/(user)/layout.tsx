import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { NavLinks } from "@/components/NavLinks";
import { ProductTour } from "@/components/ProductTour";
import { getSessionUser } from "@/lib/session";
import { getFirmForUser } from "@/lib/data-access";
import { Building2, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

/**
 * USER area layout — the firm-scoped workspace (determinations, batches).
 */
export default async function UserLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "USER") {
    redirect(user.role === "ADMIN" ? "/rules" : "/");
  }
  const firm = await getFirmForUser(user);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 px-4 shadow-sm shadow-zinc-900/[0.02] backdrop-blur sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/determinations"
              className="flex flex-none items-center gap-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <strong className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base">
                QCO-Check
              </strong>
            </Link>
            <NavLinks
              ariaLabel="User navigation"
              links={[
                {
                  href: "/determinations",
                  label: "Determinations",
                  icon: "ListChecks",
                },
                {
                  href: "/determinations/check",
                  label: "Single Check",
                  icon: "Search",
                },
                { href: "/batch", label: "Batch Upload", icon: "Upload" },
              ]}
            />
          </div>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 md:inline-flex">
              <Building2 className="h-3.5 w-3.5" />
              {firm?.name ?? "Firm workspace"}
            </span>
            <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 sm:inline-flex">
              USER
            </span>
            <span className="hidden max-w-40 truncate text-xs text-zinc-500 xl:inline">
              {user.email}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col bg-zinc-50 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <ProductTour />
    </div>
  );
}
