"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  ShieldCheck,
  XCircle,
} from "lucide-react";

const STAT_ICONS = {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Lightbulb,
  ShieldCheck,
  XCircle,
} as const;

/**
 * Animated KPI / summary stat card row.
 *
 * Renders a row of stat cards with staggered fade-in. Each card has an icon,
 * a value, a label, and an optional accent color. Respects
 * `prefers-reduced-motion`.
 */
export function StatCards({
  cards,
}: {
  cards: {
    icon: keyof typeof STAT_ICONS;
    label: string;
    value: number | string;
    accent: "zinc" | "green" | "red" | "amber" | "blue";
  }[];
}) {
  const reduceMotion = useReducedMotion();

  const accentClasses: Record<string, string> = {
    zinc: "bg-zinc-100 text-zinc-700",
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card, i) => {
        const Icon = STAT_ICONS[card.icon];
        return (
          <motion.div
            key={card.label}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            transition={{
              duration: reduceMotion ? 0 : 0.3,
              delay: reduceMotion ? 0 : i * 0.06,
            }}
            className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md motion-reduce:transition-none"
          >
            <div
              className={`flex h-9 w-9 flex-none items-center justify-center rounded-lg ${accentClasses[card.accent]}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl font-bold tracking-tight text-zinc-900">
                {card.value}
              </span>
              <span className="text-xs text-zinc-500">{card.label}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
