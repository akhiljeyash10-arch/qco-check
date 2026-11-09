/**
 * Server-side PDF template for a QCO applicability determination.
 *
 * Rendered with @react-pdf/renderer (v4+, React 19 compatible). The template
 * is a pure function of the determination data — no time-based randomness —
 * so repeated renders with the same data produce byte-identical PDFs.
 *
 * Content:
 *  - Header: report title + determination ID + generation date (createdAt).
 *  - Verdict badge (text, accessible — not color-only).
 *  - References section: IS number, Gazette ref, circular ref, transitional
 *    status, confidence, exemption notes.
 *  - Input section: product details + shipment dates.
 *  - Reasoning trace: step-by-step legal defensibility notes.
 *  - Footer: disclaimer.
 *
 * Exported via {@link renderDeterminationPdf} which returns a `Buffer` ready
 * to stream as `application/pdf`.
 *
 * @module lib/pdf/DeterminationPdf
 */

import React from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Reasoning trace step (mirrors EngineResult.reasoningTrace). */
export interface PdfReasoningStep {
  step: string;
  reason?: string;
  verdict?: string;
  [key: string]: unknown;
}

/** Subset of a persisted Determination + its input, passed to the template. */
export interface DeterminationPdfData {
  id: string;
  /** ISO date string from Determination.createdAt (deterministic — no new Date()). */
  createdAt: string;
  verdict: "GREEN" | "RED" | "AMBER";
  confidence: number;
  isNumber: string | null;
  gazetteReference: string | null;
  circularReference: string | null;
  transitionalStatus: string | null;
  exemptionNotes: string | null;
  status: string;
  reasoningTrace: PdfReasoningStep[];
  /** The original check input (product details + dates). */
  input: {
    productType?: string;
    grade?: string;
    dimensions?: string;
    material?: string;
    hsCode?: string;
    clearanceDate?: string;
    billOfLadingDate?: string;
    msmeRegistered?: boolean;
    endUse?: string;
    notDomesticallyAvailable?: boolean;
  };
  /** Firm name for the header. */
  firmName: string;
}

// ---------------------------------------------------------------------------
// Colors & styles
// ---------------------------------------------------------------------------

const COLORS = {
  headerBg: "#18181B", // zinc-900
  headerText: "#FFFFFF",
  sectionTitle: "#18181B",
  label: "#71717A", // zinc-500
  value: "#18181B",
  border: "#E4E4E7", // zinc-200
  pageBg: "#FFFFFF",
  green: "#16A34A", // green-600
  red: "#DC2626", // red-600
  amber: "#D97706", // amber-600
  greenBg: "#DCFCE7", // green-100
  redBg: "#FEE2E2", // red-100
  amberBg: "#FEF3C7", // amber-100
  footer: "#A1A1AA", // zinc-400
  traceBg: "#F4F4F5", // zinc-100
  traceText: "#3F3F46", // zinc-700
};

const VERDICT_COLORS: Record<
  "GREEN" | "RED" | "AMBER",
  { bg: string; text: string; label: string }
> = {
  GREEN: {
    bg: COLORS.greenBg,
    text: COLORS.green,
    label: "GREEN — Not applicable (no BIS certification required)",
  },
  RED: {
    bg: COLORS.redBg,
    text: COLORS.red,
    label: "RED — BIS certification mandatory",
  },
  AMBER: {
    bg: COLORS.amberBg,
    text: COLORS.amber,
    label: "AMBER — Pending expert review",
  },
};

// Disable font hyphenation (keeps legal references intact).
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.pageBg,
    paddingTop: 36,
    paddingBottom: 60,
    paddingHorizontal: 40,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: COLORS.value,
  },
  header: {
    backgroundColor: COLORS.headerBg,
    borderRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flexDirection: "column",
    gap: 2,
  },
  headerTitle: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    color: COLORS.headerText,
  },
  headerSubtitle: {
    fontSize: 8,
    color: "#A1A1AA",
  },
  headerRight: {
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
  },
  headerMeta: {
    fontSize: 7.5,
    color: "#A1A1AA",
  },
  verdictBox: {
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    flexDirection: "column",
    gap: 3,
  },
  verdictLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
  },
  verdictConfidence: {
    fontSize: 8,
    color: COLORS.traceText,
  },
  section: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.sectionTitle,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  gridItem: {
    width: "47%",
    flexDirection: "column",
    gap: 1,
  },
  label: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.label,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  value: {
    fontSize: 8.5,
    color: COLORS.value,
    lineHeight: 1.4,
  },
  valueMono: {
    fontSize: 8,
    fontFamily: "Courier",
    color: COLORS.traceText,
    lineHeight: 1.3,
  },
  traceItem: {
    backgroundColor: COLORS.traceBg,
    borderRadius: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 4,
  },
  traceStep: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.sectionTitle,
    marginBottom: 1,
  },
  traceReason: {
    fontSize: 8,
    color: COLORS.traceText,
    lineHeight: 1.4,
  },
  traceVerdict: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.traceText,
    marginTop: 1,
  },
  traceExtra: {
    fontSize: 7.5,
    fontFamily: "Courier",
    color: COLORS.label,
    marginTop: 2,
    lineHeight: 1.3,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: COLORS.footer,
    lineHeight: 1.4,
  },
  pageNumber: {
    fontSize: 7,
    color: COLORS.footer,
  },
});

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LabelValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <View style={styles.gridItem}>
      <Text style={styles.label}>{label}</Text>
      <Text style={mono ? styles.valueMono : styles.value}>
        {value ?? "—"}
      </Text>
    </View>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function TraceStep({ step }: { step: PdfReasoningStep }) {
  const extras = Object.entries(step).filter(
    ([k]) => k !== "step" && k !== "reason" && k !== "verdict",
  );
  return (
    <View style={styles.traceItem}>
      <Text style={styles.traceStep}>{step.step}</Text>
      {Boolean(step.reason) && (
        <Text style={styles.traceReason}>{step.reason as string}</Text>
      )}
      {Boolean(step.verdict) && (
        <Text style={styles.traceVerdict}>→ {step.verdict as string}</Text>
      )}
      {extras.length > 0 && (
        <Text style={styles.traceExtra}>
          {extras
            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
            .join("  |  ")}
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Document root
// ---------------------------------------------------------------------------

function DeterminationDocument({ data }: { data: DeterminationPdfData }) {
  const vc = VERDICT_COLORS[data.verdict];

  // Format date strings for display (YYYY-MM-DD from ISO).
  const createdAtDisplay = data.createdAt.slice(0, 10);
  const clearanceDateDisplay = data.input.clearanceDate?.slice(0, 10) ?? "—";
  const blDateDisplay = data.input.billOfLadingDate?.slice(0, 10) ?? "—";

  return (
    <Document
      title={`BIS QCO Determination – ${data.id}`}
      author="QCO-Check"
      subject="BIS Product Compliance Applicability Determination"
      creator="QCO-Check v1"
      producer="QCO-Check / @react-pdf/renderer"
    >
      <Page size="A4" style={styles.page}>
        {/* ============================================================ */}
        {/* HEADER                                                        */}
        {/* ============================================================ */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>
              BIS QCO Applicability Determination
            </Text>
            <Text style={styles.headerSubtitle}>
              QCO-Check — India Quality Control Order Compliance Engine
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerMeta}>Firm: {data.firmName}</Text>
            <Text style={styles.headerMeta}>ID: {data.id}</Text>
            <Text style={styles.headerMeta}>Date: {createdAtDisplay}</Text>
          </View>
        </View>

        {/* ============================================================ */}
        {/* VERDICT                                                       */}
        {/* ============================================================ */}
        <View style={[styles.verdictBox, { backgroundColor: vc.bg }]}>
          <Text style={[styles.verdictLabel, { color: vc.text }]}>
            {vc.label}
          </Text>
          <Text style={styles.verdictConfidence}>
            Confidence: {(data.confidence * 100).toFixed(0)}% | Status:{" "}
            {data.status === "PENDING_REVIEW" ? "Pending Review" : "Completed"}
          </Text>
        </View>

        {/* ============================================================ */}
        {/* REFERENCES                                                    */}
        {/* ============================================================ */}
        <View style={styles.section}>
          <SectionTitle>Legal References</SectionTitle>
          <View style={styles.grid}>
            <LabelValue label="IS Number" value={data.isNumber} />
            <LabelValue
              label="QCO Gazette Reference"
              value={data.gazetteReference}
            />
            <LabelValue
              label="CBIC Circular Reference"
              value={data.circularReference}
            />
            <LabelValue
              label="Transitional Status"
              value={data.transitionalStatus}
            />
            {data.exemptionNotes && (
              <LabelValue label="Exemption Notes" value={data.exemptionNotes} />
            )}
          </View>
        </View>

        {/* ============================================================ */}
        {/* INPUT (product details + dates)                               */}
        {/* ============================================================ */}
        <View style={styles.section}>
          <SectionTitle>Check Input</SectionTitle>
          <View style={styles.grid}>
            <LabelValue
              label="Product Type"
              value={data.input.productType ?? "—"}
            />
            <LabelValue label="Grade" value={data.input.grade ?? "—"} />
            <LabelValue
              label="Dimensions"
              value={data.input.dimensions ?? "—"}
            />
            <LabelValue label="Material" value={data.input.material ?? "—"} />
            <LabelValue label="HS Code" value={data.input.hsCode ?? "—"} mono />
            <LabelValue label="Clearance Date" value={clearanceDateDisplay} />
            <LabelValue
              label="Bill of Lading Date"
              value={blDateDisplay}
            />
            {data.input.msmeRegistered === true && (
              <LabelValue label="MSME Registered" value="Yes" />
            )}
            {data.input.endUse && (
              <LabelValue label="End Use" value={data.input.endUse} />
            )}
            {data.input.notDomesticallyAvailable === true && (
              <LabelValue
                label="Not Domestically Available"
                value="Yes"
              />
            )}
          </View>
        </View>

        {/* ============================================================ */}
        {/* REASONING TRACE                                               */}
        {/* ============================================================ */}
        {data.reasoningTrace.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>
              {"Reasoning Trace (" + String(data.reasoningTrace.length) + " steps)"}
            </SectionTitle>
            {data.reasoningTrace.map((step, i) => (
              <TraceStep key={String(i)} step={step} />
            ))}
          </View>
        )}

        {/* ============================================================ */}
        {/* FOOTER                                                        */}
        {/* ============================================================ */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            This determination is generated for informational purposes only and
            does not constitute legal advice. Verify all Gazette and circular
            references with primary sources.
          </Text>
          <Text
            style={styles.pageNumber}
            render={({ pageNumber, totalPages }) =>
              String(pageNumber) + " / " + String(totalPages)
            }
          />
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Public render function
// ---------------------------------------------------------------------------

/**
 * Render the determination PDF to a Node.js `Buffer`.
 *
 * This is a deterministic function: given the same `data`, it always produces
 * the same PDF bytes. No `new Date()` or other runtime randomness is used
 * inside the template — all dates come from the stored determination data.
 *
 * @param data  The determination data to render.
 * @returns     A Buffer ready to stream as `application/pdf`.
 */
export async function renderDeterminationPdf(
  data: DeterminationPdfData,
): Promise<Buffer> {
  const pdfBuffer = await renderToBuffer(
    <DeterminationDocument data={data} />,
  );
  return Buffer.from(pdfBuffer);
}
