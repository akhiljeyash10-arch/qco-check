/**
 * QCO-Check V1 — rules engine CLI demo.
 *
 * Builds the seed rule context in-memory (no database) and runs the pure-TS
 * engine on sample inputs that exercise every verdict path: GREEN (no active
 * QCO, transitional exemption, MSME exemption), RED (active + no exemption),
 * and AMBER (ambiguous specs). Prints the verdict, confidence, references,
 * and reasoning trace for each.
 *
 * Run:  npx tsx lib/engine/cli.ts   (or  npm run demo)
 *
 * @module lib/engine/cli
 */

import { evaluate } from "@/lib/engine/engine";
import type { EngineInput, EngineResult } from "@/lib/engine/types";
import {
  buildSeedContext,
  buildMultiCandidateContext,
  buildDraftContext,
  e250Input,
  fastenerInput,
  uncoveredInput,
  ambiguousSpecInput,
  DATES,
  STEEL_EFFECTIVE,
  STEEL_GRACE_END,
} from "@/lib/engine/fixtures";

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function pad(str: string, width: number): string {
  return str.length >= width ? str : str + " ".repeat(width - str.length);
}

function printResult(label: string, input: EngineInput, result: EngineResult): void {
  const badge =
    result.verdict === "GREEN" ? "[GREEN]" :
    result.verdict === "RED" ? "[RED]  " :
    "[AMBER]";

  console.log(`\n${"─".repeat(72)}`);
  console.log(`${badge}  ${label}`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  Input:`);
  console.log(`    HS code:        ${input.hsCode}`);
  console.log(`    Grade:          ${input.grade ?? "—"}`);
  console.log(`    Dimensions:     ${input.dimensions ?? "—"}`);
  console.log(`    Material:       ${input.material ?? "—"}`);
  console.log(`    Clearance date:  ${input.clearanceDate.toISOString().slice(0, 10)}`);
  console.log(`    BL date:        ${input.billOfLadingDate?.toISOString().slice(0, 10) ?? "—"}`);
  console.log(`    MSME registered: ${input.msmeRegistered ?? false}`);
  console.log(`  Verdict:          ${result.verdict}  (confidence: ${result.confidence.toFixed(2)})`);
  console.log(`  Status:           ${result.status}`);
  if (result.isNumber) console.log(`  IS Number:        ${result.isNumber}`);
  if (result.gazetteReference) console.log(`  Gazette ref:       ${result.gazetteReference}`);
  if (result.circularReference) console.log(`  Circular ref:      ${result.circularReference}`);
  if (result.transitionalStatus) console.log(`  Transitional:      ${result.transitionalStatus}`);
  console.log(`  Reasoning trace:`);
  for (const step of result.reasoningTrace) {
    const stepName = step.step;
    const details = Object.entries(step)
      .filter(([k]) => k !== "step")
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join(", ");
    console.log(`    ${pad(stepName, 28)} ${details}`);
  }
}

// ---------------------------------------------------------------------------
// Demo
// ---------------------------------------------------------------------------

function main(): void {
  const ctx = buildSeedContext();

  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║        QCO-Check V1 — Rules Engine Demo (pure TS, no DB)            ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  // 1. GREEN — no active QCO (HS code not covered by any item)
  printResult(
    "GREEN — No QCO item covers this HS code",
    uncoveredInput(),
    evaluate(uncoveredInput(), ctx),
  );

  // 2. RED — BIS mandatory (active QCO, outside grace window, no exemption)
  const redInput = e250Input(DATES.afterSteelGrace);
  printResult(
    "RED — BIS mandatory (active QCO, outside grace window)",
    redInput,
    evaluate(redInput, ctx),
  );

  // 3. GREEN — Transitional grace window (BL date within 90 days)
  const graceInput = e250Input(DATES.withinSteelGrace);
  printResult(
    "GREEN — Within transitional grace window (BL date within 90 days)",
    graceInput,
    evaluate(graceInput, ctx),
  );

  // 4. GREEN — MSME exemption (outside grace window, MSME registered)
  const msmeInput = e250Input(DATES.afterSteelGrace, DATES.afterSteelGrace, {
    msmeRegistered: true,
  });
  printResult(
    "GREEN — MSME exemption applies (outside grace, MSME registered)",
    msmeInput,
    evaluate(msmeInput, ctx),
  );

  // 5. AMBER — Ambiguous spec match (HS matches but grade unknown)
  const amberInput = ambiguousSpecInput(DATES.afterSteelGrace);
  printResult(
    "AMBER — Low-confidence spec match (HS matches but grade unknown)",
    amberInput,
    evaluate(amberInput, ctx),
  );

  // 6. AMBER — Multiple candidate IS standards
  const multiCtx = buildMultiCandidateContext();
  const multiInput = e250Input(DATES.afterSteelGrace);
  printResult(
    "AMBER — Multiple candidate IS standards (two items, different IS)",
    multiInput,
    evaluate(multiInput, multiCtx),
  );

  // 7. GREEN — Fasteners within clearance-date grace window
  const fastenerGraceInput = fastenerInput(DATES.withinFastenersGrace);
  printResult(
    "GREEN — Fasteners within clearance-date grace window",
    fastenerGraceInput,
    evaluate(fastenerGraceInput, ctx),
  );

  // 8. Boundary: effective date (inclusive) — GREEN (active + in grace)
  const boundaryInput = e250Input(STEEL_EFFECTIVE);
  printResult(
    "Boundary — BL date == effective date (inclusive: active + in grace window)",
    boundaryInput,
    evaluate(boundaryInput, ctx),
  );

  // 9. Boundary: grace end (inclusive) — GREEN
  const graceEndInput = e250Input(STEEL_GRACE_END);
  printResult(
    "Boundary — BL date == grace window end (inclusive: still in window)",
    graceEndInput,
    evaluate(graceEndInput, ctx),
  );

  // 10. Boundary: one day after grace — RED
  const afterGraceInput = e250Input(new Date(STEEL_GRACE_END.getTime() + 86400000));
  printResult(
    "Boundary — BL date one day after grace end (exclusive: outside window → RED)",
    afterGraceInput,
    evaluate(afterGraceInput, ctx),
  );

  // 11. DRAFT QCO — AMBER (status unclear)
  const draftCtx = buildDraftContext();
  const draftInput = e250Input(DATES.afterSteelGrace);
  printResult(
    "AMBER — Matched QCO is in DRAFT (status unclear)",
    draftInput,
    evaluate(draftInput, draftCtx),
  );

  console.log(`\n${"═".repeat(72)}`);
  console.log("  All sample verdicts printed. Engine is pure TS — no DB or LLM in the path.");
  console.log(`${"═".repeat(72)}\n`);
}

main();
