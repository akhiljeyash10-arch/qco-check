import { describe, it, expect } from "vitest";
import { buildFirmScope } from "@/lib/tenant";
import type { SessionUser } from "@/lib/session";

/**
 * Task 2 — tenant-scoping helper unit tests.
 *
 * Validates the firm-isolation contract of the data-access layer without a
 * database or Auth.js session: a USER is scoped to their own firm only, an
 * ADMIN sees all firms (no scope), and the two firms' scopes are disjoint.
 * The `firmId` used for scoping is always the one on the session-derived user,
 * never a client-supplied value.
 */

const admin = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: "u-admin",
  role: "ADMIN",
  firmId: null,
  ...overrides,
});

const user = (
  firmId: string,
  overrides: Partial<SessionUser> = {},
): SessionUser => ({
  id: `u-${firmId}`,
  role: "USER",
  firmId,
  ...overrides,
});

describe("buildFirmScope — tenant scoping", () => {
  it("scopes a USER to their own firm only", () => {
    const scope = buildFirmScope(user("firm-acme"));

    expect(scope.scoped).toBe(true);
    expect(scope.firmId).toBe("firm-acme");
    // A spreadable `where` fragment restricted to the user's firm.
    expect(scope.firmWhere).toEqual({ firmId: "firm-acme" });
  });

  it("does not scope an ADMIN — sees all firms", () => {
    const scope = buildFirmScope(admin());

    expect(scope.scoped).toBe(false);
    expect(scope.firmId).toBeNull();
    // `undefined` means "apply no firm filter".
    expect(scope.firmWhere).toBeUndefined();
  });

  it("isolates firms: two users in different firms get disjoint scopes", () => {
    const scopeA = buildFirmScope(user("firm-acme"));
    const scopeB = buildFirmScope(user("firm-bharat"));

    expect(scopeA.firmWhere).toEqual({ firmId: "firm-acme" });
    expect(scopeB.firmWhere).toEqual({ firmId: "firm-bharat" });
    expect(scopeA.firmId).not.toBe(scopeB.firmId);
    // Firm A's scope can never match Firm B's firmId, and vice versa.
    expect(scopeB.firmWhere?.firmId).not.toBe(scopeA.firmId);
    expect(scopeA.firmWhere?.firmId).not.toBe(scopeB.firmId);
  });

  it("never trusts a client-supplied firmId — scope always reflects the session user", () => {
    // The helper only reads the session-derived user; there is no parameter
    // to override the firmId from the client.
    const scope = buildFirmScope(user("firm-acme"));
    expect(scope.firmWhere).toEqual({ firmId: "firm-acme" });
  });

  it("throws when there is no session", () => {
    expect(() => buildFirmScope(null)).toThrow(/Unauthenticated/);
  });

  it("throws when a USER session is missing a firmId (invariant violation)", () => {
    expect(() =>
      buildFirmScope({ id: "u", role: "USER", firmId: null }),
    ).toThrow(/must belong to a firm/);
  });

  it("treats an ADMIN with a firmId set as still unscoped (platform operator sees all)", () => {
    // Defensive: even if an ADMIN record carried a firmId, the scope is global.
    const scope = buildFirmScope(admin({ firmId: "firm-acme" }));
    expect(scope.scoped).toBe(false);
    expect(scope.firmWhere).toBeUndefined();
  });
});
