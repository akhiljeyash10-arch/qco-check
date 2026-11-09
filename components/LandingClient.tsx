"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  CalendarClock,
  FileText,
  Lightbulb,
  ArrowRight,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { LogoutButton } from "@/components/LogoutButton";
import { startTour } from "@/components/ProductTour";

/**
 * Animated landing page (client component — uses framer-motion).
 *
 * Rendered by the server `app/page.tsx` which passes the auth `user` (or null).
 * Unauthenticated visitors see Sign Up / Sign In CTAs; authenticated users see
 * a dashboard button.
 */

interface LandingUser {
  email?: string | null;
  role?: string | null;
}

export function LandingClient({ user }: { user: LandingUser | null }) {
  const reduceMotion = useReducedMotion();
  const isAdmin = user?.role === "ADMIN";
  const dashboardHref = isAdmin ? "/rules" : "/determinations";
  const dashboardLabel = isAdmin ? "Go to Admin Console" : "Go to Dashboard";

  const fadeUp = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

  const stagger = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="flex min-h-full flex-col bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link href="/" className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-zinc-900" />
            <strong className="text-lg text-zinc-900">QCO-Check</strong>
            <span className="hidden text-sm text-zinc-400 sm:inline">
              BIS Compliance Engine
            </span>
          </Link>
          {user ? (
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={startTour}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                aria-label="Quick Tour"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Quick Tour</span>
              </button>
              <Link
                href={dashboardHref}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                {dashboardLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <span className="hidden text-sm text-zinc-500 sm:inline">
                {user.email}
              </span>
              <LogoutButton />
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={startTour}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
                aria-label="Quick Tour"
              >
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Quick Tour</span>
              </button>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Get started
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden border-b border-zinc-100 px-6 py-16 sm:py-24">
          {/* Grid background */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
          {/* Radial glow */}
          <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-96 -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl" />

          <div className="relative mx-auto flex max-w-5xl flex-col items-center gap-12 lg:flex-row">
            {/* Left: text */}
            <div className="flex max-w-xl flex-col items-center text-center lg:items-start lg:text-left">
              <motion.span
                {...fadeUp}
                transition={{ duration: reduceMotion ? 0 : 0.4 }}
                className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600"
              >
                <ShieldCheck className="h-3 w-3" />
                Steel &amp; Industrial Fasteners · Quality Control Orders
              </motion.span>
              <motion.h1
                {...fadeUp}
                transition={{
                  duration: reduceMotion ? 0 : 0.4,
                  delay: reduceMotion ? 0 : 0.05,
                }}
                className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl"
              >
                Know if your product needs BIS certification — before customs
                does.
              </motion.h1>
              <motion.p
                {...fadeUp}
                transition={{
                  duration: reduceMotion ? 0 : 0.4,
                  delay: reduceMotion ? 0 : 0.1,
                }}
                className="mt-5 text-lg leading-relaxed text-zinc-600"
              >
                QCO-Check determines whether a steel or industrial fastener
                product falls under a mandatory Indian Standard per the relevant
                Quality Control Order. Get a referenced, reproducible
                determination in seconds — for a single SKU or an entire
                shipment CSV.
              </motion.p>
              <motion.div
                {...fadeUp}
                transition={{
                  duration: reduceMotion ? 0 : 0.4,
                  delay: reduceMotion ? 0 : 0.15,
                }}
                className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
              >
                {user ? (
                  <Link
                    href={dashboardHref}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    {dashboardLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-6 py-3 text-sm font-medium text-white hover:bg-zinc-800"
                    >
                      Create an account
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                    <Link
                      href="/sign-in"
                      className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </motion.div>
              {!user && (
                <motion.p
                  {...fadeUp}
                  transition={{
                    duration: reduceMotion ? 0 : 0.4,
                    delay: reduceMotion ? 0 : 0.2,
                  }}
                  className="mt-4 text-sm text-zinc-400"
                >
                  Platform admin?{" "}
                  <Link
                    href="/sign-in"
                    className="font-medium text-zinc-600 underline-offset-4 hover:underline"
                  >
                    Sign in here
                  </Link>
                </motion.p>
              )}
            </div>

            {/* Right: preview card */}
            <motion.div
              initial={
                reduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: 30, rotateX: 5 }
              }
              animate={
                reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, rotateX: 0 }
              }
              transition={{
                duration: reduceMotion ? 0 : 0.5,
                delay: reduceMotion ? 0 : 0.2,
              }}
              className="w-full max-w-sm flex-shrink-0"
            >
              <PreviewCard />
            </motion.div>
          </div>
        </section>

        {/* Feature cards */}
        <section className="px-6 py-16">
          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-3">
            {[
              {
                icon: <ShieldCheck className="h-5 w-5" />,
                title: "QCO Applicability Check",
                description:
                  "Enter grade, dimensions, material, and HS code. The engine matches against the active QCO for steel or fasteners and returns Green, Red, or Amber with the governing IS standard and Gazette reference.",
              },
              {
                icon: <CalendarClock className="h-5 w-5" />,
                title: "BL Date vs. Clearance Date",
                description:
                  "Transitional arrangements are handled — the engine checks the Bill of Lading or clearance date against the enforcement circular's grace window, so shipments in transit aren't wrongly flagged.",
              },
              {
                icon: <FileText className="h-5 w-5" />,
                title: "PDF Determination Reports",
                description:
                  "Every determination is downloadable as a formatted PDF with the verdict, IS standard, Gazette and circular references, and the full reasoning trace — for customs documentation.",
              },
            ].map((card, i) => (
              <motion.div
                key={card.title}
                {...stagger}
                transition={{
                  duration: reduceMotion ? 0 : 0.35,
                  delay: reduceMotion ? 0 : i * 0.1,
                }}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md motion-reduce:transition-none"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700">
                  {card.icon}
                </div>
                <h3 className="text-base font-semibold text-zinc-900">
                  {card.title}
                </h3>
                <p className="text-sm leading-relaxed text-zinc-600">
                  {card.description}
                </p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-zinc-100 bg-zinc-50 px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <motion.h2
              {...fadeUp}
              transition={{ duration: reduceMotion ? 0 : 0.35 }}
              className="text-center text-2xl font-semibold tracking-tight text-zinc-900"
            >
              How it works
            </motion.h2>
            <ol className="mt-8 flex flex-col gap-6">
              {[
                {
                  icon: <FileSpreadsheet className="h-4 w-4" />,
                  title: "Run a single check or upload a CSV",
                  body: "Enter one product's details on the check screen, or batch-upload a CSV of HS codes, grades, and dates for an entire shipment.",
                },
                {
                  icon: <CheckCircle2 className="h-4 w-4" />,
                  title: "Get a referenced verdict",
                  body: "Each product returns Green (no QCO applies), Red (BIS mandatory — with the IS number and Gazette ref), or Amber (needs expert review).",
                },
                {
                  icon: <FileText className="h-4 w-4" />,
                  title: "Download the PDF report",
                  body: "Export a formatted determination report with the verdict, references, and the engine's step-by-step reasoning trace.",
                },
                {
                  icon: <Lightbulb className="h-4 w-4" />,
                  title: "Amber cases go to admin review",
                  body: "Ambiguous specs are routed to an admin queue. The admin resolves the case and can promote the decision into a new rule so future checks auto-resolve.",
                },
              ].map((step, i) => (
                <motion.li
                  key={step.title}
                  {...stagger}
                  transition={{
                    duration: reduceMotion ? 0 : 0.3,
                    delay: reduceMotion ? 0 : i * 0.08,
                  }}
                  className="flex gap-4"
                >
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                    {i + 1}
                  </span>
                  <div className="flex flex-col gap-1">
                    <h3 className="flex items-center gap-2 text-base font-medium text-zinc-900">
                      <span className="text-zinc-400">{step.icon}</span>
                      {step.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-zinc-600">
                      {step.body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 text-sm text-zinc-500 sm:flex-row">
          <span>QCO-Check — BIS Product Compliance Applicability Engine</span>
          <span>
            For steel and industrial fasteners · Quality Control Orders
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A live-style preview card showing sample determination results. */
function PreviewCard() {
  const cards = [
    {
      verdict: "RED",
      title: "RED — BIS Mandatory",
      isNumber: "IS 2062",
      gazette: "S.O. 4182(E)",
      circular: "Circular No. 12/2020",
      tone: "border-red-200 bg-red-50",
      badge: "bg-red-600 text-white",
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    {
      verdict: "GREEN",
      title: "GREEN — Not Applicable",
      isNumber: null,
      gazette: null,
      circular: null,
      tone: "border-green-200 bg-green-50",
      badge: "bg-green-600 text-white",
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">
          Sample Determinations
        </span>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
          Live Preview
        </span>
      </div>
      {cards.map((c) => (
        <div key={c.verdict} className={`rounded-xl border p-4 ${c.tone}`}>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${c.badge}`}
            >
              {c.icon}
              {c.verdict}
            </span>
            <span className="text-sm font-medium text-zinc-700">{c.title}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {c.isNumber && (
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700">
                {c.isNumber}
              </span>
            )}
            {c.gazette && (
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700">
                {c.gazette}
              </span>
            )}
            {c.circular && (
              <span className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-700">
                {c.circular}
              </span>
            )}
            {!c.isNumber && (
              <span className="text-xs text-zinc-500">
                No QCO applies to this HS code.
              </span>
            )}
          </div>
        </div>
      ))}
      <p className="text-center text-xs text-zinc-400">
        Each determination carries references for legal defensibility.
      </p>
    </div>
  );
}
