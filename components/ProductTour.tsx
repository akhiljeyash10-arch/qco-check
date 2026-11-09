"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ShieldCheck,
  CalendarClock,
  FileSpreadsheet,
  Lightbulb,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

/**
 * Interactive Quick Tour — a 4-step modal overlay shown on first visit.
 *
 * Persists completion in `localStorage` so it never nags returning users.
 * A custom `"qcocheck-start-tour"` window event replays the tour on demand
 * (triggered by the "?" button in the nav bar).
 *
 * All animations respect `prefers-reduced-motion` via framer-motion's
 * `useReducedMotion()` hook.
 */

const STORAGE_KEY = "qcocheck-tour-completed";
const TOUR_EVENT = "qcocheck-start-tour";

interface TourStep {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    icon: <ShieldCheck className="h-7 w-7" />,
    title: "Welcome to QCO-Check",
    body: "Zero-hallucination BIS QCO compliance for Steel & Industrial Fasteners. Enter a product's grade, dimensions, material, and HS code — get a referenced, reproducible Green / Red / Amber determination in seconds.",
  },
  {
    icon: <CalendarClock className="h-7 w-7" />,
    title: "Single Check & Date Logic",
    body: "The engine checks Bill of Lading or Customs Clearance dates against the enforcement circular's grace window, so shipments in transit aren't wrongly flagged. Try it on the Single Check screen.",
  },
  {
    icon: <FileSpreadsheet className="h-7 w-7" />,
    title: "Batch CSV & PDF Reports",
    body: "Upload a CSV of up to 1,000 SKUs and get per-row verdicts instantly. Download customs-ready PDF determination reports with the verdict, IS standard, Gazette ref, and full reasoning trace.",
  },
  {
    icon: <Lightbulb className="h-7 w-7" />,
    title: "Amber Review & Auto-Learning",
    body: "Uncertain (Amber) cases are routed to the Admin review queue. The admin resolves each case and can promote it into a rule — so future identical queries auto-resolve to a direct Green or Red.",
  },
];

export function ProductTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const reduceMotion = useReducedMotion();

  // Show tour on first visit (if localStorage says we haven't completed it).
  useEffect(() => {
    let frameId: number | null = null;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        frameId = window.requestAnimationFrame(() => setOpen(true));
      }
    } catch {
      // localStorage might be unavailable (SSR / privacy mode) — skip.
    }
    return () => {
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, []);

  // Listen for manual tour triggers from the nav "?" button.
  useEffect(() => {
    function handleStart() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(TOUR_EVENT, handleStart);
    return () => window.removeEventListener(TOUR_EVENT, handleStart);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Ignore.
    }
  }, []);

  const next = useCallback(() => {
    setStep((s) => (s < STEPS.length - 1 ? s + 1 : s));
  }, []);

  const back = useCallback(() => {
    setStep((s) => (s > 0 ? s - 1 : s));
  }, []);

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  // Animation variants — respect reduced motion.
  const variants = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 30 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -30 },
      };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
          onClick={close}
        >
          <motion.div
            className="mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl"
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }
            }
            animate={
              reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 20 }
            }
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-tour-heading"
          >
            {/* Header with icon */}
            <div className="relative flex flex-col items-center px-6 pt-8 pb-4">
              <button
                type="button"
                onClick={close}
                className="absolute right-4 top-4 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Close tour"
              >
                <X className="h-4 w-4" />
              </button>

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  variants={variants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: reduceMotion ? 0 : 0.2 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 text-white">
                    {current.icon}
                  </div>
                  <h2
                    id="product-tour-heading"
                    className="text-lg font-semibold text-zinc-900"
                  >
                    {current.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                    {current.body}
                  </p>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Step indicators */}
            <div className="flex items-center justify-center gap-2 pb-4">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`h-2 rounded-full transition-all motion-reduce:transition-none ${
                    i === step
                      ? "w-8 bg-zinc-900"
                      : "w-2 bg-zinc-300 hover:bg-zinc-400"
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                  aria-current={i === step}
                />
              ))}
            </div>

            {/* Footer with buttons */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-6 py-4">
              <span className="text-xs text-zinc-400">
                Step {step + 1} of {STEPS.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
                >
                  Skip tour
                </button>
                {step > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="inline-flex items-center rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Back
                  </button>
                )}
                <button
                  type="button"
                  onClick={isLast ? close : next}
                  className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  {isLast ? "Get started" : "Next"}
                  {!isLast && <ChevronRight className="ml-1 h-4 w-4" />}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Dispatch a window event to replay the tour (called by the nav "?" button). */
export function startTour() {
  window.dispatchEvent(new Event(TOUR_EVENT));
}
