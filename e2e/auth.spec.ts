import { test, expect } from "@playwright/test";

/**
 * Task 2 — auth flow E2E.
 *
 * Exercises the full sign-in -> role-based access -> cross-firm isolation
 * journey against the running app + seeded database:
 *   - a USER signs in and sees only their own firm's determinations area;
 *   - a USER is blocked from the admin rule-editor / queue;
 *   - cross-firm isolation: Firm B's user sees Firm B, never Firm A;
 *   - an ADMIN signs in and sees the rule editor + queue;
 *   - an ADMIN is blocked from the USER determinations area;
 *   - bad credentials are rejected.
 *
 * Prerequisite: the database is up, migrated, and seeded
 * (`npm run db:up && npm run db:migrate && npm run db:seed`).
 */

const USER_A = { email: "asha@acme.in", password: "User@123" };
const USER_B = { email: "rahul@bharat.in", password: "User@123" };
const ADMIN = { email: "admin@qcocheck.local", password: "Admin@123" };

type Credentials = { email: string; password: string };

async function signIn(
  page: import("@playwright/test").Page,
  creds: Credentials,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(creds.email);
  await page.getByLabel("Password").fill(creds.password);
  // Register the navigation waiter BEFORE the click so it observes the
  // server-action redirect (success leaves /sign-in and sets the session
  // cookie). Waiting here keeps the sign-in from being raced by the caller's
  // next navigation.
  const settled = page.waitForURL(
    (url) => !url.pathname.startsWith("/sign-in"),
    { timeout: 20000 },
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  await settled;
}

// Run the auth-flow tests serially: they share a single dev server and each
// performs a credentials sign-in + role-based navigation. Running them in
// parallel against one `next dev` (Turbopack) instance causes transient
// sign-in failures under concurrent load; serial execution keeps each sign-in
// isolated and deterministic.
test.describe.serial("auth flow", () => {
  test("a USER signs in and sees only their own firm's determinations area", async ({
    page,
  }) => {
    await signIn(page, USER_A);

    await expect(page).toHaveURL(/\/determinations/);
    await expect(
      page.getByRole("heading", { name: "Determinations" }),
    ).toBeVisible();
    // Own firm is shown.
    await expect(page.getByText("Acme Steel Imports Pvt Ltd")).toBeVisible();
    // The other firm never appears.
    await expect(page.getByText("Bharat Customs Brokers")).toHaveCount(0);
  });

  test("a USER cannot reach the admin rule-editor or queue", async ({
    page,
  }) => {
    await signIn(page, USER_A);

    await page.goto("/rules");
    await expect(page).toHaveURL(/\/determinations/);

    await page.goto("/queue");
    await expect(page).toHaveURL(/\/determinations/);
  });

  test("cross-firm isolation: Firm B's user sees Firm B, not Firm A", async ({
    page,
  }) => {
    await signIn(page, USER_B);

    await expect(page).toHaveURL(/\/determinations/);
    await expect(page.getByText("Bharat Customs Brokers")).toBeVisible();
    await expect(page.getByText("Acme Steel Imports Pvt Ltd")).toHaveCount(0);
  });

  test("an ADMIN signs in and sees the rule editor + queue", async ({
    page,
  }) => {
    await signIn(page, ADMIN);

    await expect(page).toHaveURL(/\/rules/);
    await expect(
      page.getByRole("heading", { name: "Rule Editor" }),
    ).toBeVisible();

    await page.goto("/queue");
    await expect(page).toHaveURL(/\/queue/);
    await expect(
      page.getByRole("heading", { name: "Review Queue" }),
    ).toBeVisible();
  });

  test("an ADMIN cannot reach the USER determinations area", async ({
    page,
  }) => {
    await signIn(page, ADMIN);

    await page.goto("/determinations");
    await expect(page).toHaveURL(/\/rules/);
  });

  test("bad credentials are rejected with an inline error", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill("asha@acme.in");
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });
});
