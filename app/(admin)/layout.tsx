import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { NavLinks } from "@/components/NavLinks";
import { ProductTour } from "@/components/ProductTour";
import { ShieldCheck } from "lucide-react";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * ADMIN area layout — the platform-operator workspace (rule editor + review
 * queue).
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.role !== "ADMIN") redirect("/determinations");

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-t-4 border-indigo-700 border-b border-zinc-200/80 bg-white/95 px-4 shadow-sm shadow-zinc-900/[0.02] backdrop-blur sm:px-6">
        <div className="mx-auto flex min-h-16 max-w-screen-2xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/rules" className="flex flex-none items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-950 text-white">
                <ShieldCheck className="h-4 w-4" />
              </span>
              <strong className="text-sm font-semibold tracking-tight text-zinc-900 sm:text-base">
                QCO-Check
              </strong>
              <span className="hidden rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold tracking-wider text-indigo-800 sm:inline-flex">
                ADMIN CONSOLE
              </span>
            </Link>
            <NavLinks
              ariaLabel="Admin navigation"
              showTourButton={false}
              links={[
                { href: "/rules", label: "Rule Editor", icon: "BookOpen" },
                {
                  href: "/queue",
                  label: "Review Queue",
                  icon: "ClipboardList",
                },
              ]}
            />
          </div>
          <div className="flex flex-none items-center gap-2 sm:gap-3">
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="flex flex-1 flex-col bg-slate-100 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <ProductTour />
    </div>
  );
}
