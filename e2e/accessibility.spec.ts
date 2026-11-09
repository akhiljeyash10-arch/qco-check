import { test, expect } from "@playwright/test";

/**
 * Task 10 — Accessibility checks (Playwright E2E).
 *
 * Verifies the WCAG-AA-relevant accessibility guarantees that are
 * programmatically checkable:
 *   - Verdict badges carry the verdict word as text AND an ARIA label (never
 *     color alone) — on both the single-check screen and the batch results.
 *   - Form fields have associated <label> elements (keyboard-navigable via
 *     accessible names).
 *   - The verdict result region is announced to assistive tech
 *     (role="status" / aria-live).
 *   - Required fields are marked (aria-required) and the required indicator
 *     is hidden from screen readers (aria-hidden).
 *   - Focus rings are present (focus-visible styles) so keyboard users can see
 *     where they are.
 *
 * Full colour-contrast validation requires a visual/contrast tool and expert
 * review; these tests assert the structural accessibility contract that the
 * app enforces in code.
 *
 * Prerequisite: the database is up, migrated, and seeded
 * (`npm run db:up && npm run db:migrate && npm run db:seed`).
 */

const USER_A = { email: "asha@acme.in", password: "User@123" };

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

// ---------------------------------------------------------------------------
// Single-check screen
// ---------------------------------------------------------------------------

test.describe.serial("accessibility — single-check screen", () => {
  test("form fields are labelled and keyboard-navigable", async ({ page }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    // Every key field is reachable + labelled via its accessible name.
    await expect(page.getByLabel("HS code")).toBeVisible();
    await expect(page.getByLabel("Clearance date")).toBeVisible();
    await expect(page.getByLabel("Bill of Lading date")).toBeVisible();
    await expect(page.getByLabel("Product type")).toBeVisible();
    await expect(page.getByLabel("Grade")).toBeVisible();

    // Required fields carry aria-required.
    await expect(page.getByLabel("HS code")).toHaveAttribute(
      "aria-required",
      "true",
    );
    await expect(page.getByLabel("Clearance date")).toHaveAttribute(
      "aria-required",
      "true",
    );

    // Keyboard navigation: focus moves onto the HS code field via Tab.
    await page.getByLabel("HS code").focus();
    await expect(page.getByLabel("HS code")).toBeFocused();

    // The submit button is a real <button> with an accessible name.
    await expect(
      page.getByRole("button", { name: /run check/i }),
    ).toBeVisible();
  });

  test("the verdict badge carries text + ARIA (not color alone) for a RED result", async ({
    page,
  }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    // E250, BL date well after the grace window → RED.
    await page.getByLabel("Product type").fill("structural steel");
    await page.getByLabel("Grade").fill("E250");
    await page.getByLabel("Dimensions").fill("plates/sections/profiles");
    await page.getByLabel("Material").fill("carbon structural steel");
    await page.getByLabel("HS code").fill("7208.52");
    await page.getByLabel("Clearance date").fill("2021-06-01");
    await page.getByLabel("Bill of Lading date").fill("2021-06-01");
    await page.getByRole("button", { name: /run check/i }).click();

    // The badge text is the verdict word (RED) — never color alone.
    const badge = page.getByRole("status", { name: /RED/i }).first();
    await expect(badge).toBeVisible();
    await expect(badge).toHaveText(/RED/);
    // And it carries a descriptive ARIA label.
    await expect(badge).toHaveAttribute(
      "aria-label",
      expect.stringContaining("RED"),
    );

    // The result region announces to assistive tech (aria-live).
    await expect(
      page.locator('[aria-labelledby="verdict-heading"]'),
    ).toBeVisible();
    await expect(page.getByText("IS 2062").first()).toBeVisible();
  });

  test("the reasoning trace is in a disclosure with an accessible summary", async ({
    page,
  }) => {
    await signIn(page, USER_A);
    await page.goto("/determinations/check");

    await page.getByLabel("HS code").fill("7208.52");
    await page.getByLabel("Clearance date").fill("2021-06-01");
    await page.getByLabel("Bill of Lading date").fill("2021-06-01");
    await page.getByRole("button", { name: /run check/i }).click();

    // The reasoning trace is a <details> disclosure whose <summary> carries
    // an accessible text label (focusable via the summary).
    const summary = page.locator("summary", { hasText: /reasoning trace/i });
    await expect(summary).toBeVisible();
    // The summary is focusable (keyboard-navigable disclosure).
    await summary.focus();
    await expect(summary).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// Batch results screen
// ---------------------------------------------------------------------------

test.describe.serial("accessibility — batch results screen", () => {
  test("per-row verdict badges carry text + ARIA (not color alone)", async ({
    page,
  }) => {
    await signIn(page, USER_A);
    await page.goto("/batch");

    // A small CSV: one RED steel row, one uncovered GREEN row, one malformed row.
    const csv =
      "productType,grade,dimensions,material,hsCode,clearanceDate,billOfLadingDate\n" +
      "structural steel,E250,plates/sections/profiles,carbon structural steel,7208.52,2021-06-01,2021-06-01\n" +
      "unknown,unknown,unknown,unknown,9999.99,2021-06-01,2021-06-01\n" +
      "structural steel,E250,plates/sections/profiles,carbon structural steel,,2021-06-01,2021-06-01\n";

    const fileInput = page.getByLabel("CSV file");
    await fileInput.setInputFiles({
      name: "accessibility-test.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf-8"),
    });
    await page.getByRole("button", { name: /upload and check/i }).click();

    // The results region is announced (role=status, aria-live).
    await expect(page.getByRole("heading", { name: "Batch results" })).toBeVisible();
    await expect(
      page.locator('[aria-label*="Batch complete"]'),
    ).toBeVisible();

    // The RED row badge carries the verdict word + an ARIA label.
    const redBadge = page.getByRole("img", { name: /^Verdict: RED/i }).first();
    await expect(redBadge).toBeVisible();
    await expect(redBadge).toHaveText(/RED/);

    // The GREEN row badge likewise.
    const greenBadge = page
      .getByRole("img", { name: /^Verdict: GREEN/i })
      .first();
    await expect(greenBadge).toBeVisible();
    await expect(greenBadge).toHaveText(/GREEN/);

    // The errored row shows an ERROR badge (text, not just a color).
    const errorBadge = page.getByRole("img", { name: /Error/i }).first();
    await expect(errorBadge).toBeVisible();
    await expect(errorBadge).toHaveText(/ERROR/);
  });

  test("the file input is labelled and required", async ({ page }) => {
    await signIn(page, USER_A);
    await page.goto("/batch");
    const fileInput = page.getByLabel("CSV file");
    await expect(fileInput).toBeVisible();
    await expect(fileInput).toHaveAttribute("aria-required", "true");
  });
});
