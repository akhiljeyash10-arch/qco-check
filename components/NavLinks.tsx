"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  ClipboardList,
  HelpCircle,
  ListChecks,
  Search,
  Upload,
} from "lucide-react";
import { startTour } from "@/components/ProductTour";

const NAV_ICONS = {
  BookOpen,
  ClipboardList,
  ListChecks,
  Search,
  Upload,
} as const;

interface NavLinkItem {
  href: string;
  label: string;
  icon: keyof typeof NAV_ICONS;
}

/**
 * Client-side nav link list with active-route highlighting, Lucide icons,
 * and a Quick Tour "?" trigger button.
 *
 * Active-state rules:
 *  - `/determinations` → exact match only (so `/determinations/check` lights
 *    up "Single Check" instead of both).
 *  - All other routes → `pathname.startsWith(href)` so sub-routes keep the
 *    parent link active.
 */
export function NavLinks({
  links,
  ariaLabel,
  showTourButton = true,
}: {
  links: NavLinkItem[];
  ariaLabel: string;
  showTourButton?: boolean;
}) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-3">
      <nav className="flex items-center gap-1" aria-label={ariaLabel}>
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          const Icon = NAV_ICONS[link.icon];
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none ${
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{link.label}</span>
            </Link>
          );
        })}
      </nav>
      {showTourButton && (
        <button
          type="button"
          onClick={startTour}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors motion-reduce:transition-none hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          aria-label="Quick Tour"
          title="Quick Tour"
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Quick Tour</span>
        </button>
      )}
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/determinations") return false;
  return pathname.startsWith(href + "/");
}
