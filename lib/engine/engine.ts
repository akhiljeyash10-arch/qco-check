/**
 * Pure-TS rules engine — the verdict engine.
 *
 * A fully deterministic, dependency-free module. It takes a typed
 * {@link RuleContext} (rule versions loaded server-side) and a typed
 * {@link EngineInput} and returns an {@link EngineResult} (verdict + reasoning
 * trace). No database, no UI, no LLM — every IS number and reference comes from
 * the curated, versioned rule context.
 *
 * ## Boundary semantics (explicitly defined)
 *
 * **Effective date** (inclusive lower bound): a QCO is active "as of" date D
 * when `effectiveFrom <= D`. A date exactly equal to `effectiveFrom` is active;
 * one day before is not.
 *
 * **Supersession** (exclusive upper bound): a superseded QCO is active in
 * `[effectiveFrom, supersededAt)`. At exactly `supersededAt` the superseding
 * QCO is active, not this one.
 *
 * **Transitional grace window** (inclusive both ends): the window is
 * `[windowStart, windowStart + gracePeriodDays]`. A trigger date exactly equal
 * to `windowStart` is in the window. A trigger date exactly equal to
 * `windowStart + gracePeriodDays` is in the window. One day after is not.
 *
 * **Exemption effective range** (inclusive both ends): an exemption applies
 * when `effectiveFrom <= applicableDate <= effectiveTo`.
 *
 * @module lib/engine/engine
 */

import type {
  EngineInput,
  EngineResult,
  EngineStatus,
  Exemption,
  QCO,
  QCOItem,
  ReasoningStep,
  RuleContext,
  TransitionalArrangement,
  Verdict,
} from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Confidence threshold above which a spec match is considered "high
 * confidence" and the engine proceeds to the active / transitional / exemption
 * checks. Below this threshold the verdict is AMBER (low-confidence → route to
 * review).
 *
 * Scoring components (max 1.0):
 *   HS code exact (8/10-digit) match ........... 0.40
 *   HS code 6-digit prefix match ............... 0.20
 *   HS code 4-digit prefix match ............... 0.10
 *   Grade exact (case-insensitive) match ........ 0.30
 *   Grade partial (substring) match ............ 0.15
 *   Dimensions exact match ..................... 0.20
 *   Dimensions partial match ................... 0.10
 *   Material match (case-insensitive) ........... 0.10
 *
 * High (≥ 0.70): exact HS + exact grade + dimensions/material confirmed.
 * Low  (< 0.70): 6-digit HS only, or partial grade → Amber.
 */
export const HIGH_CONFIDENCE_THRESHOLD = 0.7;

// ---------------------------------------------------------------------------
// Date / string helpers
// ---------------------------------------------------------------------------

/** Add `days` calendar days to a date (returns a new Date; preserves UTC). */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Strip non-digit characters from an HS code (e.g. "7208.52" → "720852"). */
export function normalizeHs(code: string): string {
  return code.replace(/[^0-9]/g, "");
}

/** Length of the common digit prefix of two strings. */
function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * Score string similarity: 1.0 for exact (case-insensitive) match, 0.5 for a
 * substring (partial) match, 0 for no match. Used for grade / dimensions /
 * material fields.
 */
function stringMatchScore(input?: string, spec?: string): number {
  if (!input || !spec) return 0;
  const a = input.trim().toLowerCase();
  const b = spec.trim().toLowerCase();
  if (!a || !b) return 0;
  if (a === b) return 1.0; // exact
  if (a.includes(b) || b.includes(a)) return 0.5; // partial (substring)
  return 0;
}

/** Round a confidence value to 2 decimal places (clean, deterministic output). */
function roundConfidence(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// resolveCandidatesByHs
// ---------------------------------------------------------------------------

/**
 * Resolve candidate QCOItems by HS-code match. HS codes are a matching hint;
 * the spec match (grade / dimensions / material) carries the actual decision.
 *
 * A candidate is returned when the input HS code and one of the item's HS-code
 * hints share at least a 4-digit prefix (one is a prefix of the other). This is
 * intentionally loose — false positives become AMBER via the spec-confidence
 * check, never RED.
 */
export function resolveCandidatesByHs(
  hsCode: string,
  ruleContext: RuleContext,
): QCOItem[] {
  const input = normalizeHs(hsCode);
  if (input.length < 4) return [];
  return ruleContext.qcoItems.filter((item) =>
    item.hsCodes.some((code) => {
      const c = normalizeHs(code);
      if (c.length < 4) return false;
      const minLen = Math.min(input.length, c.length);
      return minLen >= 4 && input.slice(0, minLen) === c.slice(0, minLen);
    }),
  );
}

// ---------------------------------------------------------------------------
// matchSpecs
// ---------------------------------------------------------------------------

/** HS-code confidence contribution (max 0.40). */
function hsConfidence(inputHs: string, itemHsCodes: string[]): number {
  const input = normalizeHs(inputHs);
  if (!input) return 0;
  let best = 0;
  for (const code of itemHsCodes) {
    const c = normalizeHs(code);
    if (!c) continue;
    const shared = sharedPrefixLength(input, c);
    const minLen = Math.min(input.length, c.length);
    if (shared < minLen) continue; // diverge before the end of the shorter → not a prefix match
    if (shared >= 8) best = Math.max(best, 0.4);
    else if (shared >= 6) best = Math.max(best, 0.2);
    else if (shared >= 4) best = Math.max(best, 0.1);
  }
  return best;
}

/**
 * Match the product specs (grade, dimensions, material) against a QCOItem's
 * gradeSpec and compute a confidence score.
 *
 * @returns `{ matched, confidence }` — `matched` is true when confidence > 0
 *          (the item is a real candidate, not a complete miss).
 */
export function matchSpecs(
  input: EngineInput,
  qcoItem: QCOItem,
): { matched: boolean; confidence: number } {
  let score = 0;

  // HS component (max 0.40)
  score += hsConfidence(input.hsCode, qcoItem.hsCodes);

  // Grade component (max 0.30)
  score += stringMatchScore(input.grade, qcoItem.gradeSpec.grade) * 0.3;

  // Dimensions component (max 0.20)
  score += stringMatchScore(input.dimensions, qcoItem.gradeSpec.dimensions) * 0.2;

  // Material component (max 0.10)
  score += stringMatchScore(input.material, qcoItem.gradeSpec.material) * 0.1;

  const confidence = Math.min(1, Math.max(0, score));
  return { matched: confidence > 0, confidence };
}

// ---------------------------------------------------------------------------
// isQcoActiveAsOf
// ---------------------------------------------------------------------------

/**
 * Point-in-time activity check: is this QCO active (legally in force) as of the
 * applicable date?
 *
 * - DRAFT → never active (not yet published).
 * - IN_ABEYANCE → not active (enforcement stayed).
 * - SUPERSEDED → active only before `supersededAt` (exclusive upper bound).
 *   If `supersededAt` is unknown, conservatively not active.
 * - PUBLISHED → active when `effectiveFrom <= applicableDate` (inclusive lower
 *   bound). If `effectiveFrom` is null, treat as active (effective from the
 *   notification date or immediately).
 */
export function isQcoActiveAsOf(qco: QCO, applicableDate: Date): boolean {
  // DRAFT is never active.
  if (qco.status === "DRAFT") return false;

  // IN_ABEYANCE: enforcement stayed → not active.
  if (qco.status === "IN_ABEYANCE") return false;

  // Not yet effective: applicable date is before the effective date (exclusive).
  if (
    qco.effectiveFrom &&
    applicableDate.getTime() < qco.effectiveFrom.getTime()
  ) {
    return false;
  }

  // SUPERSEDED: active only in [effectiveFrom, supersededAt).
  if (qco.status === "SUPERSEDED") {
    if (qco.supersededAt) {
      // Exclusive upper bound: at exactly supersededAt, the superseding QCO is active.
      return applicableDate.getTime() < qco.supersededAt.getTime();
    }
    // Superseded but no supersession date known → conservatively not active.
    return false;
  }

  // PUBLISHED and effective (effectiveFrom <= applicableDate, or no effectiveFrom).
  return true;
}

// ---------------------------------------------------------------------------
// applicableTriggerDate
// ---------------------------------------------------------------------------

/**
 * Select the trigger date the engine should evaluate against, per the
 * transitional arrangement's `triggerDateType`.
 *
 * - BILL_OF_LADING → the user-supplied BL date (null if not provided).
 * - CLEARANCE_DATE → the clearance date.
 * - BILL_OF_ENTRY / IMPORT_DATE → the clearance date (V1 proxy; these
 *   separate dates are not captured individually yet).
 *
 * @returns the applicable date, or `null` when the required date is missing.
 */
export function applicableTriggerDate(
  input: EngineInput,
  transitional: TransitionalArrangement,
): Date | null {
  switch (transitional.triggerDateType) {
    case "BILL_OF_LADING":
      return input.billOfLadingDate ?? null;
    case "CLEARANCE_DATE":
    case "BILL_OF_ENTRY":
    case "IMPORT_DATE":
      return input.clearanceDate;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// inTransitionalWindow
// ---------------------------------------------------------------------------

/**
 * Check whether the trigger date falls within the transitional grace window.
 *
 * The window is `[effectiveFrom, effectiveFrom + gracePeriodDays]` — inclusive
 * on both ends. Returns `false` when `effectiveFrom` is null (window unknown).
 */
export function inTransitionalWindow(
  triggerDate: Date,
  transitional: TransitionalArrangement,
): boolean {
  const start = transitional.effectiveFrom;
  if (!start) return false;
  const end = addDays(start, transitional.gracePeriodDays);
  // Inclusive both ends: [start, end]
  return (
    start.getTime() <= triggerDate.getTime() &&
    triggerDate.getTime() <= end.getTime()
  );
}

// ---------------------------------------------------------------------------
// evaluateExemptions
// ---------------------------------------------------------------------------

/**
 * Evaluate whether an exemption applies to the input as of the applicable date.
 *
 * - ABEYANCE / DEFERRED: blanket stays — apply when in-effect (no input
 *   qualification needed).
 * - MSME_PHASED: applies when in-effect AND the input claims MSME registration.
 * - END_USE: applies when in-effect AND the input's end-use matches the
 *   exemption's `conditions.endUse`.
 * - NOT_DOMESTICALLY_AVAILABLE: applies when in-effect AND the input claims the
 *   product is not domestically available.
 *
 * @returns the first matching in-effect exemption, or `null`.
 */
export function evaluateExemptions(
  input: EngineInput,
  qco: QCO,
  applicableDate: Date,
  ruleContext: RuleContext,
): Exemption | null {
  const exemptions = ruleContext.exemptions.filter((e) => e.qcoId === qco.id);
  for (const exemption of exemptions) {
    // Check effective date range (inclusive both ends).
    if (
      exemption.effectiveFrom &&
      applicableDate.getTime() < exemption.effectiveFrom.getTime()
    ) {
      continue; // not yet in effect
    }
    if (
      exemption.effectiveTo &&
      applicableDate.getTime() > exemption.effectiveTo.getTime()
    ) {
      continue; // no longer in effect
    }

    // Type-specific qualification check.
    switch (exemption.type) {
      case "ABEYANCE":
      case "DEFERRED":
        // Blanket stays — apply when in-effect.
        return exemption;
      case "MSME_PHASED":
        if (input.msmeRegistered) return exemption;
        break;
      case "END_USE":
        if (
          input.endUse &&
          matchesEndUseCondition(input.endUse, exemption.conditions)
        ) {
          return exemption;
        }
        break;
      case "NOT_DOMESTICALLY_AVAILABLE":
        if (input.notDomesticallyAvailable) return exemption;
        break;
    }
  }
  return null;
}

/** Check an input end-use against the exemption conditions (case-insensitive). */
function matchesEndUseCondition(
  value: string,
  conditions?: Record<string, unknown> | null,
): boolean {
  if (!conditions) return true; // no conditions → matches anything
  const condEndUse = conditions.endUse;
  if (typeof condEndUse === "string") {
    return value.trim().toLowerCase() === condEndUse.trim().toLowerCase();
  }
  return true; // no structured endUse condition → matches
}

// ---------------------------------------------------------------------------
// evaluate (the composer)
// ---------------------------------------------------------------------------

/** Build an {@link EngineResult} from the resolved entities. */
function buildResult(
  verdict: Verdict,
  confidence: number,
  matchedItem: QCOItem | null,
  qco: QCO | null,
  circular: { id: string; circularReference: string } | null,
  transitional: TransitionalArrangement | null,
  status: EngineStatus,
  reasoningTrace: ReasoningStep[],
): EngineResult {
  const isNumber =
    matchedItem?.isStandards.map((is) => is.isNumber).join(", ") ?? null;
  const gazetteReference = qco?.gazetteReference ?? null;
  const circularReference = circular?.circularReference ?? null;
  const transitionalStatus = transitional
    ? `trigger: ${transitional.triggerDateType}, grace: ${transitional.gracePeriodDays} days`
    : null;
  return {
    verdict,
    confidence: roundConfidence(confidence),
    isNumber,
    gazetteReference,
    circularReference,
    transitionalStatus,
    qcoItemId: matchedItem?.id ?? null,
    qcoId: qco?.id ?? null,
    enforcementCircularId: circular?.id ?? null,
    status,
    reasoningTrace,
  };
}

/**
 * Evaluate a single applicability check against the rule context and return a
 * verdict + reasoning trace.
 *
 * Flow (see design.md flowchart):
 *  1. Resolve candidate QCOItems by HS code.
 *  2. If no candidates → GREEN (no QCO item covers this HS code).
 *  3. Score each candidate's spec match; if all below threshold → AMBER.
 *  4. Resolve QCO + applicable date + active status for each high-confidence
 *     candidate (handles supersession: inactive QCO items are filtered out).
 *  5. If all high-confidence candidates have DRAFT QCOs → AMBER (unclear).
 *  6. Filter to active candidates; if none → AMBER (missing date) or GREEN.
 *  7. If multiple active candidates cite different IS standards → AMBER.
 *  8. Pick the best active candidate; check transitional grace window → GREEN.
 *  9. If an exemption applies → GREEN.
 * 10. Otherwise → RED (BIS certification mandatory).
 */
export function evaluate(
  input: EngineInput,
  ruleContext: RuleContext,
): EngineResult {
  const trace: ReasoningStep[] = [];

  // Guard: HS code is required to resolve candidates.
  if (!input.hsCode?.trim()) {
    trace.push({ step: "guard", reason: "No HS code provided" });
    return buildResult(
      "AMBER",
      0,
      null,
      null,
      null,
      null,
      "PENDING_REVIEW",
      trace,
    );
  }

  // Step 1: Resolve candidates by HS code.
  const candidates = resolveCandidatesByHs(input.hsCode, ruleContext);
  trace.push({
    step: "resolveCandidatesByHs",
    hsCode: input.hsCode,
    candidateCount: candidates.length,
    candidateIds: candidates.map((c) => c.id),
  });

  // Step 2: No candidates → GREEN.
  if (candidates.length === 0) {
    trace.push({
      step: "verdict",
      verdict: "GREEN",
      reason: "No QCO item covers this HS code",
    });
    return buildResult(
      "GREEN",
      0,
      null,
      null,
      null,
      null,
      "COMPLETED",
      trace,
    );
  }

  // Step 3: Score each candidate and sort by confidence (descending).
  const scored = candidates
    .map((item) => ({ item, ...matchSpecs(input, item) }))
    .sort((a, b) => b.confidence - a.confidence);

  trace.push({
    step: "matchSpecs",
    scores: scored.map((s) => ({
      itemId: s.item.id,
      confidence: roundConfidence(s.confidence),
    })),
  });

  const highConfidence = scored.filter(
    (s) => s.confidence >= HIGH_CONFIDENCE_THRESHOLD,
  );

  // Step 3b: No high-confidence match → AMBER (low confidence).
  if (highConfidence.length === 0) {
    trace.push({
      step: "verdict",
      verdict: "AMBER",
      reason: "Low-confidence spec match — route to review",
    });
    return buildResult(
      "AMBER",
      scored[0].confidence,
      scored[0].item,
      null,
      null,
      null,
      "PENDING_REVIEW",
      trace,
    );
  }

  // Step 4: Resolve QCO + applicable date + active status for EACH
  // high-confidence candidate. This handles supersession correctly: a
  // superseded QCO's item is filtered out in favour of the superseding QCO's
  // active item (same HS code, same IS standard, but only one is active).
  const resolved = highConfidence.map((s) => {
    const qco = ruleContext.qcos.find((q) => q.id === s.item.qcoId) ?? null;
    if (!qco) {
      return {
        s, qco: null, circular: null, transitional: null,
        applicableDate: null, active: false, draft: false, missingDate: false,
      };
    }

    const circular =
      ruleContext.enforcementCirculars.find((ec) => ec.qcoId === qco.id) ?? null;
    const transitional = circular
      ? (ruleContext.transitionalArrangements.find(
          (ta) => ta.enforcementCircularId === circular.id,
        ) ?? null)
      : null;

    let applicableDate: Date | null;
    let missingDate = false;
    if (transitional) {
      applicableDate = applicableTriggerDate(input, transitional);
      if (!applicableDate) missingDate = true;
    } else {
      applicableDate = input.clearanceDate;
    }

    const draft = qco.status === "DRAFT";
    const active =
      !draft && !missingDate && isQcoActiveAsOf(qco, applicableDate!);

    return { s, qco, circular, transitional, applicableDate, active, draft, missingDate };
  });

  trace.push({
    step: "resolveActiveCandidates",
    candidates: resolved.map((r) => ({
      itemId: r.s.item.id,
      qcoId: r.qco?.id ?? null,
      qcoStatus: r.qco?.status ?? "NOT_FOUND",
      active: r.active,
      draft: r.draft,
      missingDate: r.missingDate,
    })),
  });

  // Step 5: If ALL high-confidence candidates have DRAFT QCOs → AMBER (unclear).
  if (resolved.length > 0 && resolved.every((r) => r.draft)) {
    const top = resolved[0];
    trace.push({
      step: "verdict",
      verdict: "AMBER",
      reason: "All matched QCOs are in DRAFT status — not yet in force, status unclear",
    });
    return buildResult(
      "AMBER",
      top.s.confidence,
      top.s.item,
      top.qco,
      null,
      null,
      "PENDING_REVIEW",
      trace,
    );
  }

  // Step 6: Filter to active candidates.
  const activeCandidates = resolved.filter((r) => r.active);
  const anyMissingDate = resolved.some((r) => r.missingDate);

  if (activeCandidates.length === 0) {
    const top = resolved.find((r) => r.missingDate) ?? resolved[0];
    if (anyMissingDate) {
      trace.push({
        step: "verdict",
        verdict: "AMBER",
        reason: "Required trigger date not provided — cannot evaluate",
      });
      return buildResult(
        "AMBER",
        top.s.confidence,
        top.s.item,
        top.qco,
        top.circular,
        top.transitional,
        "PENDING_REVIEW",
        trace,
      );
    }
    // No active QCO among the high-confidence candidates → GREEN.
    trace.push({
      step: "verdict",
      verdict: "GREEN",
      reason: "No active QCO as of the applicable date",
    });
    return buildResult(
      "GREEN",
      top.s.confidence,
      top.s.item,
      top.qco,
      top.circular,
      top.transitional,
      "COMPLETED",
      trace,
    );
  }

  // Step 7: Multiple IS standards among ACTIVE candidates → AMBER.
  const isNumbers = new Set(
    activeCandidates.flatMap((r) =>
      r.s.item.isStandards.map((is) => is.isNumber),
    ),
  );
  trace.push({
    step: "checkMultipleIsStandards",
    isNumbers: [...isNumbers],
    ambiguous: isNumbers.size > 1,
  });
  if (isNumbers.size > 1) {
    trace.push({
      step: "verdict",
      verdict: "AMBER",
      reason: "Multiple candidate IS standards — ambiguous",
    });
    return buildResult(
      "AMBER",
      activeCandidates[0].s.confidence,
      activeCandidates[0].s.item,
      activeCandidates[0].qco,
      null,
      null,
      "PENDING_REVIEW",
      trace,
    );
  }

  // Step 8: Pick the best active candidate (highest confidence — order preserved
  // from the sorted highConfidence array).
  const best = activeCandidates[0];
  const { s: bestScored, qco, circular, transitional } = best;
  const applicableDate = best.applicableDate!;

  trace.push({
    step: "selectBestActiveCandidate",
    itemId: bestScored.item.id,
    qcoId: qco!.id,
    qcoStatus: qco!.status,
    applicableDate: applicableDate.toISOString(),
    triggerDateType: transitional?.triggerDateType ?? "CLEARANCE_DATE",
  });

  // Step 9: Transitional grace window.
  if (transitional) {
    const windowStart = transitional.effectiveFrom ?? circular?.effectiveDate ?? null;
    if (windowStart) {
      const resolvedTransitional: TransitionalArrangement = {
        ...transitional,
        effectiveFrom: windowStart,
      };
      const inWindow = inTransitionalWindow(applicableDate, resolvedTransitional);
      trace.push({
        step: "inTransitionalWindow",
        windowStart: windowStart.toISOString(),
        windowEnd: addDays(windowStart, transitional.gracePeriodDays).toISOString(),
        inWindow,
      });
      if (inWindow) {
        trace.push({
          step: "verdict",
          verdict: "GREEN",
          reason: "Shipment falls within the transitional grace window",
        });
        return buildResult(
          "GREEN",
          bestScored.confidence,
          bestScored.item,
          qco,
          circular,
          transitional,
          "COMPLETED",
          trace,
        );
      }
    } else {
      trace.push({
        step: "inTransitionalWindow",
        reason: "Transitional arrangement exists but window start is unknown",
      });
    }
  }

  // Step 10: Exemptions.
  const exemption = evaluateExemptions(
    input,
    qco!,
    applicableDate,
    ruleContext,
  );
  trace.push({
    step: "evaluateExemptions",
    exemptionType: exemption?.type ?? null,
  });
  if (exemption) {
    trace.push({
      step: "verdict",
      verdict: "GREEN",
      reason: `Exemption applies: ${exemption.type} — ${exemption.description}`,
    });
    return buildResult(
      "GREEN",
      bestScored.confidence,
      bestScored.item,
      qco,
      circular,
      transitional,
      "COMPLETED",
      trace,
    );
  }

  // Step 11: RED — BIS certification mandatory.
  trace.push({
    step: "verdict",
    verdict: "RED",
    reason: "QCO active, outside transitional window, no exemption — BIS mandatory",
  });
  return buildResult(
    "RED",
    bestScored.confidence,
    bestScored.item,
    qco,
    circular,
    transitional,
    "COMPLETED",
    trace,
  );
}
