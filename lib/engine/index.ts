/**
 * Pure-TS rules engine — public API.
 *
 * Re-exports everything the API layer (Task 5), tests, and CLI need. The
 * engine itself has no database or UI dependency; import from here to use it.
 *
 * @module lib/engine
 */

export type {
  QcoStatus,
  TriggerDateType,
  ExemptionType,
  Verdict,
  GradeSpec,
  ISStandard,
  QCO,
  QCOItem,
  EnforcementCircular,
  TransitionalArrangement,
  Exemption,
  RuleContext,
  EngineInput,
  ReasoningStep,
  EngineStatus,
  EngineResult,
} from "./types";

export {
  HIGH_CONFIDENCE_THRESHOLD,
  addDays,
  normalizeHs,
  resolveCandidatesByHs,
  matchSpecs,
  isQcoActiveAsOf,
  applicableTriggerDate,
  inTransitionalWindow,
  evaluateExemptions,
  evaluate,
} from "./engine";
