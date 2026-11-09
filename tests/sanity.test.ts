import { describe, it, expect } from "vitest";

/**
 * Task 1 harness smoke test.
 *
 * Proves Vitest is wired and that `npm run test` exits 0 even though no feature
 * tests have been written yet. Real engine/property-based tests arrive in
 * Task 4 (and Task 10).
 */
describe("test harness", () => {
  it("runs vitest", () => {
    expect(true).toBe(true);
  });
});
