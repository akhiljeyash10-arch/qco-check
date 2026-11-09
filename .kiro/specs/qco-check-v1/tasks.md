# Implementation Plan: QCO-Check V1

## Overview

Test-driven, incremental build. Each task produces a working, demoable increment that builds on the previous and is fully integrated (no orphaned code). Property-based testing (Vitest + fast-check) is required in Task 4 and Task 10.

## Tasks

- [x] 1. Scaffold project, tooling, and DB connection
  - Objective: a runnable monorepo with the stack wired and a passing health check.
  - Implementation guidance: init Next.js App Router + TypeScript + Tailwind; add Prisma + PostgreSQL (local/Docker Postgres); add Vitest + fast-check + Playwright + ESLint/Prettier; `.env` schema (DATABASE_URL, AUTH_SECRET); a `/api/health` route. Cross-platform npm scripts (Windows/PowerShell-friendly).
  - Test requirements: health route returns 200; `npm run test`/`lint`/`build` pass on an empty suite.
  - Demo: dev server runs, DB connects, `prisma migrate` runs, health check green.

- [x] 2. Auth + multi-tenancy foundation
  - Objective: signed-in users with roles and firm isolation.
  - Implementation guidance: Auth.js + Prisma adapter; `Firm` and `User` models; session carries `firmId` + `role`; protected layouts (USER area, ADMIN area); a tenant-scoping helper in the data-access layer; seed one admin and two firms with a user each. Never trust client-supplied `firmId` — derive from the session.
  - Test requirements: unit tests for the tenant-scoping helper (USER sees own firm only; ADMIN sees all); auth flow E2E.
  - Demo: log in as User (sees only own determinations area) and Admin (sees rule-editor + queue); cross-firm isolation verified.

- [x] 3. Rule data model + migrations + seed dataset
  - Objective: the full rule schema in Postgres with a minimal real seed.
  - Implementation guidance: Prisma models for QCO, ISStandard, QCOItem, EnforcementCircular, TransitionalArrangement, Exemption, Determination, Batch, ReviewQueueItem, AuditLog; version/effective-date fields; migrations; a seed script with a curated subset of the Steel QCO 2020 (a few real QCOItems incl. a CRGO item) and one fastener QCO item. Use "VERIFY" placeholders for exact Gazette refs/dates to be confirmed during curation.
  - Test requirements: migration runs clean; seed idempotent; Prisma relations resolve; relation integrity tests.
  - Demo: Prisma Studio shows seeded QCOs, QCOItems, circulars, transitional arrangements.

- [x] 4. Rules engine core (pure TS, TDD) — INCLUDES PROPERTY-BASED TESTING
  - Objective: the verdict engine as an isolated, fully unit- and property-tested pure-TS module.
  - Implementation guidance: pure functions — `resolveCandidatesByHs`, `matchSpecs` (with confidence), `isQcoActiveAsOf` (point-in-time), `applicableTriggerDate` (BILL_OF_LADING vs CLEARANCE_DATE per trigger type), `inTransitionalWindow`, `evaluateExemptions`, and `evaluate` (composes into verdict + reasoningTrace). The engine takes a typed `RuleContext` (rule versions) and a typed `Input`; no DB/UI dependency. Define explicit inclusive/exclusive boundary semantics for effective dates and grace-window edges.
  - Test requirements:
    - Unit tests (Vitest): fixtures covering Green (no active QCO, transitional exemption, MSME/exemption), Red (active + no exemption), Amber (ambiguous specs, multiple candidates, unclear status), supersession/abeyance, and point-in-time reproducibility.
    - Property-based tests (Vitest + fast-check) — required invariants:
      - Determinism: `evaluate(input, ctx)` is identical across repeated calls with identical input + rule context.
      - No-active-QCO implies never RED.
      - Confidence ∈ [0,1] for all inputs.
      - Transitional window monotonicity: BL date within the grace window → never RED.
      - Amber safety: low-confidence inputs never return RED.
      - Boundary correctness: dates exactly at effective-date / grace-window edges behave per defined semantics.
  - Demo: Vitest + fast-check suite green; a CLI/test script prints verdicts for sample inputs.

- [x] 5. Single-check API + storage + UI
  - Objective: the primary screen works end-to-end for a logged-in user.
  - Implementation guidance: a server route loads the active rule versions, builds the `RuleContext`, runs the engine, persists a `Determination` (with `reasoningTrace` + `ruleVersionSnapshot`) scoped to the user's firm, and returns the verdict; the UI form (product type, grade, dimensions, material, HS code, clearance date, BL date) posts to it and renders Green/Red/Amber badges (text + ARIA, not color alone) with IS number, Gazette ref, circular ref, transitional status, and the reasoning trace.
  - Test requirements: API integration test (firm-scoped Determination persisted); engine-DB wiring test; boundary inputs at effective date.
  - Demo: logged-in user runs a single check and sees a correct, referenced verdict with an accessible badge.

- [x] 6. PDF determination report
  - Objective: a defensible, dated, referenced PDF per determination.
  - Implementation guidance: server-side `@react-pdf/renderer` template rendering all inputs, verdict, IS number, Gazette + circular references, transitional status, exemption notes, and reasoning; download from the determination view; deterministic content (no time-based randomness).
  - Test requirements: structural test that the PDF contains the expected references for a sample RED determination; determinism check across runs.
  - Demo: user downloads a PDF matching the on-screen verdict.

- [x] 7. Admin rule-editor UI
  - Objective: admins can curate/version rules without deploys.
  - Implementation guidance: admin-only CRUD for QCO, ISStandard, QCOItem, EnforcementCircular, TransitionalArrangement, Exemption; effective-date + status + supersession fields; edits create new versions (immutability); AuditLog entries; input validation; confirmation on status changes.
  - Test requirements: create/edit/status flows; version immutability; audit log written; authorization (non-admins denied).
  - Demo: admin adds a QCOItem and a transitional arrangement; a subsequent single check reflects the new rule.

- [x] 8. CSV batch upload
  - Objective: bulk checks with a results download.
  - Implementation guidance: upload → server-side parse (validate columns) → per-row engine → store `Determinations` + a `Batch` → render a results table with per-row badges → downloadable results CSV; handle large files with row limits and per-row errors; firm-scoped.
  - Test requirements: batch API processes N rows, stores N determinations, reports per-row errors; firm scoping; malformed-row handling.
  - Demo: user uploads a CSV and sees per-row Green/Red/Amber with a downloadable results file.

- [x] 9. Admin review queue + promote-to-rule
  - Objective: close the human-in-the-loop loop.
  - Implementation guidance: admin queue lists Amber `Determination`s (all firms); admin sets a resolution verdict + notes → updates the user's `Determination` (PENDING → RESOLVED); a one-click "promote to rule" opens the rule-editor prefilled from the case and, on save, creates a `QCOItem` linked back via `ReviewQueueItem.promotedQcoItemId`; future identical queries auto-resolve; AuditLog entries.
  - Test requirements: resolve-then-promote flow; a subsequent identical query auto-resolves (no longer Amber); audit + linking correct; authorization.
  - Demo: an Amber case is resolved and promoted; the same input now returns a direct Green/Red.

- [x] 10. Hardening, reproducibility, and polish — INCLUDES PROPERTY-BASED TESTING
  - Objective: production-credible V1.
  - Implementation guidance: input validation + friendly error/empty states; rate limiting; full AuditLog coverage; a reproducibility check (re-run an old determination's inputs against its snapshotted rule versions → same verdict); expand the seed dataset; responsive layout; accessibility (focus, contrast, ARIA on badges/forms); loading/error UI for batch; clean env handling.
  - Test requirements:
    - Reproducibility regression test.
    - Accessibility checks.
    - E2E of the full journey (sign in → single check → PDF → batch → an Amber case → admin resolve/promote → re-check).
    - Property-based tests (Vitest + fast-check) — required:
      - [x] 10.1 Property test — Reproducibility: re-running `evaluate` against a determination's `ruleVersionSnapshot` yields the identical verdict.
      - [x] 10.2 Property test — Batch row independence: a malformed/errored row does not alter other rows' verdicts.
      - [x] 10.3 Property test — Parse robustness: CSV parsing preserves well-formed rows regardless of malformed rows elsewhere.
      - [x] 10.4 Property test — Cross-path consistency: identical inputs produce identical verdicts through both the single-check and batch APIs.
      - [x] 10.5 Property test — Date-boundary consistency between single and batch paths.
  - Demo: complete end-to-end journey with reproducible, referenced determinations; property-based suites green.

## Task Dependency Graph

- Task 1: Scaffold project, tooling, and DB connection (no dependencies)
- Task 2: Auth + multi-tenancy foundation (depends on Task 1)
- Task 3: Rule data model + migrations + seed dataset (depends on Task 2)
- Task 4: Rules engine core (depends on Task 3)
- Task 5: Single-check API + storage + UI (depends on Task 4)
- Task 6: PDF determination report (depends on Task 5)
- Task 7: Admin rule-editor UI (depends on Task 3)
- Task 8: CSV batch upload (depends on Task 5)
- Task 9: Admin review queue + promote-to-rule (depends on Task 7, Task 8)
- Task 10: Hardening, reproducibility, and polish (depends on Task 6, Task 9)

```json
{
  "waves": [
    { "tasks": [1] },
    { "tasks": [2] },
    { "tasks": [3] },
    { "tasks": [4] },
    { "tasks": [5, 7] },
    { "tasks": [6, 8] },
    { "tasks": [9] },
    { "tasks": [10] }
  ]
}
```

## Notes

- After all tasks: confirm the three spec files (`requirements.md`, `design.md`, `tasks.md`) exist in `spec/qco-check-v1/` and that no application code/scaffolding was created.
