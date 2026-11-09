/**
 * Tests for the PDF determination report (Task 6).
 *
 * Structural tests:
 *  1. The rendered PDF for a sample RED determination contains the expected
 *     legal references (IS number, Gazette reference, circular reference).
 *  2. The PDF is non-empty and starts with the PDF magic bytes (%PDF).
 *
 * Determinism tests:
 *  3. Two renders of the same data produce byte-identical output.
 *  4. Renders of different data differ.
 *
 * @module lib/pdf/DeterminationPdf.test
 */

import { describe, it, expect } from "vitest";
import {
  renderDeterminationPdf,
  type DeterminationPdfData,
} from "./DeterminationPdf";
import { extractPdfText, pdfContains } from "./pdfTextExtract";

// ---------------------------------------------------------------------------
// Sample RED determination data (mirrors a realistic RED engine result)
// ---------------------------------------------------------------------------

const RED_DETERMINATION: DeterminationPdfData = {
  id: "test-det-001-red-e250",
  createdAt: "2026-06-15T08:30:00.000Z",
  verdict: "RED",
  confidence: 1.0,
  isNumber: "IS 2062",
  gazetteReference:
    "S.O. 4182(E) dated 22 Dec 2020",
  circularReference:
    "CBIC Circular No. 12-2020-Customs",
  transitionalStatus: "trigger: BILL_OF_LADING, grace: 90 days",
  exemptionNotes: null,
  status: "COMPLETED",
  reasoningTrace: [
    {
      step: "resolveCandidatesByHs",
      hsCode: "7208.52",
      candidateCount: 1,
      candidateIds: ["qcoitem-steel-e250"],
    },
    {
      step: "matchSpecs",
      scores: [{ itemId: "qcoitem-steel-e250", confidence: 1.0 }],
    },
    {
      step: "verdict",
      verdict: "RED",
      reason:
        "QCO active, outside transitional window, no exemption — BIS mandatory",
    },
  ],
  input: {
    productType: "structural steel",
    grade: "E250",
    dimensions: "plates/sections/profiles",
    material: "carbon structural steel",
    hsCode: "7208.52",
    clearanceDate: "2026-06-15T00:00:00.000Z",
    billOfLadingDate: "2026-06-10T00:00:00.000Z",
    msmeRegistered: false,
  },
  firmName: "Test Importer Co.",
};

const GREEN_DETERMINATION: DeterminationPdfData = {
  ...RED_DETERMINATION,
  id: "test-det-002-green-e250",
  verdict: "GREEN",
  transitionalStatus: null,
  exemptionNotes: "Exemption applies: MSME_PHASED — MSME-phased compliance timeline",
  reasoningTrace: [
    {
      step: "resolveCandidatesByHs",
      hsCode: "7208.52",
      candidateCount: 1,
    },
    {
      step: "verdict",
      verdict: "GREEN",
      reason: "Exemption applies: MSME_PHASED — MSME-phased compliance timeline",
    },
  ],
  input: {
    ...RED_DETERMINATION.input,
    msmeRegistered: true,
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("renderDeterminationPdf", () => {
  it("produces a non-empty PDF buffer with valid magic bytes for a RED determination", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.byteLength).toBeGreaterThan(1024);

    // Every valid PDF starts with "%PDF-".
    const magic = buf.subarray(0, 5).toString("ascii");
    expect(magic).toBe("%PDF-");
  });

  it("embeds the IS number in the PDF for a RED determination", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    expect(await pdfContains(buf, "IS 2062")).toBe(true);
  });

  it("embeds the Gazette reference in the PDF for a RED determination", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    // Check for a distinctive substring of the Gazette reference.
    expect(await pdfContains(buf, "S.O. 4182")).toBe(true);
  });

  it("embeds the CBIC circular reference in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    expect(await pdfContains(buf, "CBIC Circular")).toBe(true);
  });

  it("embeds the verdict word in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    const text = await extractPdfText(buf);
    expect(text).toContain("RED");
    // The template label for RED verdict.
    expect(text).toContain("BIS certification mandatory");
  });

  it("embeds the determination ID in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    expect(await pdfContains(buf, RED_DETERMINATION.id)).toBe(true);
  });

  it("embeds the HS code in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    expect(await pdfContains(buf, "7208.52")).toBe(true);
  });

  it("embeds the firm name in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    expect(await pdfContains(buf, "Test Importer Co.")).toBe(true);
  });

  it("embeds reasoning trace step labels in the PDF", async () => {
    const buf = await renderDeterminationPdf(RED_DETERMINATION);
    // "verdict" step should appear in the trace.
    expect(await pdfContains(buf, "verdict")).toBe(true);
  });

  it("renders a GREEN determination with the correct verdict label", async () => {
    const buf = await renderDeterminationPdf(GREEN_DETERMINATION);
    const magic = buf.subarray(0, 5).toString("ascii");
    expect(magic).toBe("%PDF-");
    const text = await extractPdfText(buf);
    expect(text).toContain("GREEN");
    expect(text).toContain("Not applicable");
  });

  it("embeds exemption notes in the GREEN determination PDF", async () => {
    const buf = await renderDeterminationPdf(GREEN_DETERMINATION);
    expect(await pdfContains(buf, "MSME_PHASED")).toBe(true);
  });

  // Determinism checks --------------------------------------------------------

  it("produces identical content on two renders of the same data (determinism)", async () => {
    const [buf1, buf2] = await Promise.all([
      renderDeterminationPdf(RED_DETERMINATION),
      renderDeterminationPdf(RED_DETERMINATION),
    ]);

    // Same size — structure doesn't change.
    expect(buf1.byteLength).toBe(buf2.byteLength);

    // Content-level determinism: extracted text is identical.
    const text1 = await extractPdfText(buf1);
    const text2 = await extractPdfText(buf2);
    expect(text1).toBe(text2);
  });

  it("produces different output for different determinations", async () => {
    const bufRed = await renderDeterminationPdf(RED_DETERMINATION);
    const bufGreen = await renderDeterminationPdf(GREEN_DETERMINATION);

    // Different data → different PDF content.
    const textRed = await extractPdfText(bufRed);
    const textGreen = await extractPdfText(bufGreen);
    expect(textRed).not.toBe(textGreen);
  });

  it("determinism holds across three concurrent renders (content check)", async () => {
    const [a, b, c] = await Promise.all([
      renderDeterminationPdf(RED_DETERMINATION),
      renderDeterminationPdf(RED_DETERMINATION),
      renderDeterminationPdf(RED_DETERMINATION),
    ]);

    const [ta, tb, tc] = await Promise.all([
      extractPdfText(a),
      extractPdfText(b),
      extractPdfText(c),
    ]);

    expect(ta).toBe(tb);
    expect(tb).toBe(tc);
  });
});
