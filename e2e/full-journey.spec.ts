import { test, expect } from "@playwright/test";

/**
 * Task 10 — End-to-end full journey (Playwright).
 *
 * The complete user journey the demo requires:
 *   sign in (user) → single check → PDF download → CSV batch → an Amber case →
 *   admin resolve → promote to rule → re-check (auto-resolves to a direct
 *   verdict).
 *
 * A timestamp-based unique grade keeps each run independent of QCOItems
 * promoted by prior runs (the engine's spec match would otherwise find the
 * old item and skip Amber).
 *
 * Prerequisite: the database is up, migrated, and seeded
 * (`npm run db:up && npm run db:migrate && npm run db:seed`).
 */

const USER_A = { email: "asha@acme.in", password: "User@123" };
const ADMIN = { email: "admin@qcocheck.local", password: "Admin@123" };

type Credentials = { email: string; password: string };

async function signIn(
  page: import("@playwright/test").Page,
  creds: Credentials,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  const settled = page.waitForURL(
    (url) => !url.pathname.startsWith("/sign-in"),
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  await settled;
}

// A unique grade per run so promoted rules from prior runs don't auto-resolve.
const UNIQUE_GRADE = `E2E-AMBER-${Date.now()}`;

test.describe.serial("full journey — sign in → check → PDF → batch → Amber → resolve → promote → re-check", () => {
  // ---------------------------------------------------------------------
  // 1. User signs in and runs a single check (RED)
  // ---------------------------------------------------------------------
  test("user signs in and runs a single RED check", async ({ page }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    await page.getByLabel("Product type").fill("structural steel");
    await page.getByLabel("Grade").fill("E250");
    await page.getByLabel("Dimensions").fill("plates/sections/profiles");
    await page.getByLabel("Material").fill("carbon structural steel");
    await page.getByLabel("HS code").fill("7208.52");
    await page.getByLabel("Clearance date").fill("2021-06-01");
    await page.getByLabel("Bill of Lading date").fill("2021-06-01");
    await page.getByRole("button", { name: /run check/i }).click();

    // RED verdict + referenced IS number + Gazette ref.
    await expect(
      page.getByRole("status", { name: /RED/i }).first(),
    ).toBeVisible();
    await expect(page.getByText("IS 2062").first()).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 2. User downloads the PDF determination report
  // ---------------------------------------------------------------------
  test("user downloads a PDF report", async ({ page }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    await page.getByLabel("Grade").fill("E250");
    await page.getByLabel("Dimensions").fill("plates/sections/profiles");
    await page.getByLabel("Material").fill("carbon structural steel");
    await page.getByLabel("HS code").fill("7208.52");
    await page.getByLabel("Clearance date").fill("2021-06-01");
    await page.getByLabel("Bill of Lading date").fill("2021-06-01");
    await page.getByRole("button", { name: /run check/i }).click();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: /download pdf/i }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    // Read the first bytes to confirm a PDF (%PDF header).
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c) => chunks.push(c as Buffer));
      stream.on("end", () => resolve());
      stream.on("error", reject);
    });
    const head = Buffer.concat(chunks).toString("latin1").slice(0, 5);
    expect(head).toContain("%PDF");
  });

  // ---------------------------------------------------------------------
  // 3. User uploads a CSV batch (mixed: RED, GREEN, and an Amber case)
  // ---------------------------------------------------------------------
  test("user uploads a CSV batch and sees per-row verdicts incl. an Amber case", async ({
    page,
  }) => {
    await signIn(page, USER_A);
    await page.goto("/batch");

    const csv =
      "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate\n" +
      "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01\n" +
      "unknown,unknown,unknown,unknown,9999.99,2021-06-01,2021-06-01\n" +
      `structural steel,${UNIQUE_GRADE},plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01\n`;

    await page.getByLabel("CSV file").setInputFiles({
      name: "journey.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
    await page.getByRole("button", { name: /upload and check/i }).click();

    await expect(page.getByRole("heading", { name: "Batch results" })).toBeVisible();
    // RED, GREEN, and AMBER badges are all present.
    await expect(
      page.getByRole("img", { name: /^Verdict: RED/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /^Verdict: GREEN/i }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: /^Verdict: AMBER/i }).first(),
    ).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 4-7. Admin signs in, resolves the Amber case, and promotes it to a rule
  // ---------------------------------------------------------------------
  test("admin resolves the Amber case and promotes it to a rule", async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    await page.goto("/queue");

    // The Amber case (our unique grade) is in the queue.
    const caseRow = page.getByRole("row").filter({ hasText: UNIQUE_GRADE });
    await expect(caseRow).toBeVisible();

    // Open the case detail.
    await caseRow.getByRole("link", { name: "Review" }).click();
    await expect(
      page.getByRole("heading", { name: "Review Case" }),
    ).toBeVisible();
    await expect(page.getByText(UNIQUE_GRADE).first()).toBeVisible();

    // Resolve: final verdict RED + notes.
    await page
      .getByLabel("Final verdict")
      .selectOption({ label: "RED — BIS mandatory" });
    await page.getByLabel("Resolution notes").fill("Confirmed grade per mill test certificate.");
    await page.getByRole("button", { name: "Resolve case" }).click();

    // After resolve, the case shows the resolved verdict.
    await expect(page.getByText(/Resolved verdict/i)).toBeVisible();

    // Promote to rule.
    await page.getByRole("link", { name: /Promote to rule/i }).click();
    await expect(
      page.getByRole("heading", { name: "Promote to Rule" }),
    ).toBeVisible();

    // The form is prefilled from the case. Set the grade to the unique grade
    // and select the steel QCO + IS 2067 so it high-confidence-matches.
    await page
      .getByLabel("Governing QCO")
      .selectOption({ value: "qco-steel-2020" });
    // Ensure the grade field holds the unique grade.
    await page.getByLabel("Grade").fill(UNIQUE_GRADE);
    await page.getByLabel("HS codes (comma or space separated)").fill("7208.52");
    // Select IS 2062 (the structural steel standard). The checkbox is visually
    // hidden behind a clickable label "chip" (sr-only + overlay label), so we
    // force-check it directly (Playwright's recommended handling for
    // visually-hidden checkboxes with covering labels).
    await page
      .getByRole("checkbox", { name: /Include IS 2062/i })
      .check({ force: true });
    await page.getByRole("button", { name: "Promote to rule" }).click();

    // Promotion redirects back to the case and shows "Promoted".
    await expect(page.getByText(/Promoted to rule/i)).toBeVisible();
  });

  // ---------------------------------------------------------------------
  // 8. User re-checks the same input → auto-resolves to a direct RED verdict
  // ---------------------------------------------------------------------
  test("user re-checks the same Amber input and it now auto-resolves to RED", async ({
    page,
  }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    await page.getByLabel("Product type").fill("structural steel");
    await page.getByLabel("Grade").fill(UNIQUE_GRADE);
    await page.getByLabel("Dimensions").fill("plates/sections/profiles");
    await page.getByLabel("Material").fill("carbon structural steel");
    await page.getByLabel("HS code").fill("7208.52");
    await page.getByLabel("Clearance date").fill("2021-06-01");
    await page.getByLabel("Bill of Lading date").fill("2021-06-01");
    await page.getByRole("button", { name: /run check/i }).click();

    // The promoted rule now high-confidence-matches → RED (no longer Amber).
    await expect(
      page.getByRole("status", { name: /RED/i }).first(),
    ).toBeVisible();
    await expect(page.getByText("IS 2062").first()).toBeVisible();
    // It is a completed determination, not pending review.
    await expect(page.getByText(/Pending review/i)).toHaveCount(0);
  });
});
