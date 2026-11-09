# QCO-Check V1 — Requirements

## 1. Product Overview

**QCO-Check – BIS Product Compliance Applicability Engine (V1 MVP)** is a B2B web application that helps Indian importers and Customs House Agents (CHAs) determine whether a specific Steel or Industrial Fastener product requires mandatory BIS certification under India's Quality Control Orders (QCOs), based on technical specifications (grade, dimensions, material), HS codes, and exact shipment/clearance dates.

The system answers a single question: **"Does this product need BIS certification?"** (applicability only). It does NOT validate whether a BIS licence is held or valid.

## 2. Problem Statement

Indian importers and CHAs clearing steel and industrial fasteners must decide whether a specific product requires mandatory BIS certification under a QCO before goods can clear customs. Today this is done manually from consultant memory: it is error-prone, and the date logic (Bill of Lading date vs. clearance date, transitional arrangements, MSME phasing, abeyance, deferred enforcement) is where costly mistakes happen — goods get held or confiscated at port. QCOs are written against Indian Standard (IS) numbers and product descriptions in legal tables, not HS codes, so mapping a real shipment (classified by HS code + spec) to a QCO is the core hard problem.

## 3. Target Audience

Two user types sharing one flow:

- **Customs House Agents (CHAs)** — primary flow: fast, in-the-moment at-clearance checks with a downloadable PDF determination report to show the assessing officer.
- **Importers / procurement teams** — reuse the same flow for pre-order / pre-shipment checks to avoid goods landing in India without BIS certification.

Administrators (platform operators) curate the shared rule knowledge base and resolve ambiguous cases via a human-in-the-loop review queue.

## 4. Goals (V1 MVP)

- Deliver a fast single-SKU and CSV batch applicability check for steel + fastener products.
- Return a clear Green / Red / Amber verdict anchored to a specific IS number and the governing QCO Gazette reference + CBIC circular reference.
- Apply a dated rules engine keyed to the correct trigger date (Bill of Lading vs. clearance) per the governing QCO's transitional arrangement.
- Keep all rules data-driven, versioned, and point-in-time reproducible (determinations remain reproducible after later amendments).
- Provide an admin rule-editor and a review queue that promotes resolved ambiguous cases back into the shared rule base.
- Enforce zero-hallucination legal accuracy: no LLM in the determination path; every IS number and reference comes from curated, sourced, versioned DB rows.
- Multi-tenant: multiple importer/CHA firms self-serve with firm-level data isolation (each firm sees only its own determinations). No billing in V1.

## 5. Non-Goals (V1)

- BIS licence validation / tracking (compliance status vs. applicability) is out of scope.
- No automated Gazette monitoring/alerts (V2).
- No ERP API integration (V3).
- No AI PDF spec extractor (V3; even then, human-reviewed before touching a verdict).
- No billing/payments/metering in V1.
- V1 covers the Steel & Steel Products QCO and the Fasteners QCO as a focused high-impact subset — not every obscure grade or other domains.

## 6. Deferred to Future Versions

- **V2**: Chemicals & Electricals product domains; Supplier Portal (suppliers self-declare/attach BIS certs); automated Gazette-of-India monitoring alerts for new/amended QCOs.
- **V3**: ERP API integration (SAP/Oracle) to check at PO creation; AI PDF spec extractor for mill test certificates / spec sheets (always human-reviewed).

## 7. V1 MVP Features

1. **Single SKU check** — input product type, grade, dimensions, material, HS code, clearance date, Bill of Lading date → Green/Red/Amber verdict with IS number + Gazette/circular reference + transitional status.
2. **CSV batch upload** — bulk check many SKUs; downloadable results.
3. **Dated rules engine** — rules indexed by effective dates and transitional arrangements; point-in-time resolution.
4. **Green / Red / Amber applicability verdict** with IS number and QCO Gazette reference (and the CBIC circular that makes a date effective).
5. **Admin human-in-the-loop review queue** — ambiguous/low-confidence cases routed for expert review; admin resolves verdict AND can promote the decision into a rule.
6. **Determinaton report (PDF)** — a dated, referenced PDF a CHA can attach to a customs filing.
7. **Rule versioning & audit trail** — every determination reproducible against the rule versions active when it was made; QCO amendments/supersession tracked.
8. **Admin rule-editor UI** — admins create/edit/version rules without deploys.
9. **Multi-tenant isolation** — firm-level isolation of determinations/batches; shared global rules curated by admins.

## 8. User Journey

1. User signs in (importer or CHA role). Admins sign into the rule-editor/queue.
2. User picks Single check or Batch upload (CSV).
3. User enters product details: type, grade (e.g., IS 2062 E250), dimensions, material, HS code, clearance date, and Bill of Lading date.
4. The rules engine matches against the rule set active as of the applicable date, applying transitional arrangements.
5. The system returns Green (not applicable / transitional exemption / exempt — with reason) or Red (BIS mandatory — with IS number, QCO Gazette ref, circular ref, enforcement/effective date, transitional status, notes/conditions), or Amber (pending admin review).
6. Low-confidence/ambiguous matches route to the admin review queue; the user sees "Pending Review" and later receives the finalized answer.
7. User downloads a PDF determination report for the customs file.

## 9. Success Criteria

- A CHA can run a single check and receive a correct, referenced Green/Red/Amber verdict within seconds.
- Batch CSV upload returns per-row verdicts and a downloadable results file.
- Determinations are reproducible against their snapshotted rule versions even after later amendments.
- Admins can add/edit/version rules and resolve+promote Amber cases that thereafter auto-resolve.
- Firm A cannot see Firm B's determinations.
- No verdict ever cites an IS number or Gazette reference that is absent from curated DB rows (zero hallucination).
- Property-based tests prove engine invariants hold for arbitrary inputs (see design.md and tasks.md).

## 10. Constraints & Standards

- **Zero-hallucination legal accuracy**: the determination path is deterministic, pure-TS, and sourced entirely from curated, versioned DB rows. No LLM in the determination path.
- **Legal defensibility**: every determination stores a reasoning trace and a rule-version snapshot.
- **Data curation**: V1 begins from scratch — data acquisition/curation of the core steel + fastener QCOs is part of V1, starting with a focused high-impact subset.
- **Cross-platform**: stack runs on Windows (PowerShell) with npm scripts.
- **Accessibility**: badges/forms/screens meet WCAG AA (badges carry text labels + ARIA, not color alone).

## 11. Research Findings (verified vs. to-verify during curation)

Verified from public sources:
- QCOs are issued under **Section 16 of the BIS Act, 2016**; once mandatory, import without a licence + mark (ISI mark for steel) is illegal, penalty up to 2 years (Gazette / Wikipedia).
- QCOs surged 88 (2019) → 765 (2024), ~100 in pipeline; metals is the #1 impacted sector (CSEP, "Decoding India's Quality Control Orders").
- The core hard problem is the HS↔QCO mapping — CSEP built a curated database doing this manually; they recommend QCOs specify corresponding HS codes and BIS consolidate into one database.
- The Steel and Steel Products (QCO) Order, 2020 has multiple instruments (notifications dated 17 Jul 2020, 22 Jul 2020, and 22 Dec 2020 "made effective by circular5"), uses Clause 2(c) and a product Table-2; CRGO steel is a hotly litigated import category (Indian Kanoon).
- Customs enforcement is operationalized via CBIC circulars that carry the effective date + transitional arrangement; multiple 2025–2026 customs disputes confirm this is live and high-stakes.
- MSME phased timelines, abeyance, and deferred enforcement are real patterns; MSME compliance burden ~₹10k–₹15k/consignment.
- Forward signal: a Feb 2026 notification requires an "Advance Registration Number" for steel importers (note for V2/edge).

To verify during curation (could not be fetched from primary sources): exact Gazette references / S.O. numbers; exact enforcement dates; exact transitional-clause wording (which date each instrument keys off — BL vs bill of entry — and the grace period); the exact IS-number product table; fastener QCO specifics.

## 12. Open Questions (for curation / V1 build)

- Exact Gazette references and enforcement dates for each Steel QCO instrument (17 Jul 2020, 22 Jul 2020, 22 Dec 2020) and the fastener QCO.
- Exact transitional-clause trigger date and grace period per instrument.
- Final V1 IS-standard product subset (proposed seed: common structural/HR plate grades in the IS 2062 / IS 1079 class + commonly imported bolts/nuts/washers; CRGO as a flagged edge case).
- Whether to model the Feb 2026 "Advance Registration Number" mechanism now or defer to V2 (recommend: defer).
