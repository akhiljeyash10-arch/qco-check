import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  resetRateLimitStore,
  rateLimitKey,
} from "@/lib/rate-limit";

/**
 * Task 10 — rate limiter unit tests.
 *
 * The limiter is a pure, deterministic function over a shared in-memory store
 * with an injected clock (`now`), so the allow/deny boundary is tested exactly
 * without sleeping or relying on real time.
 */

beforeEach(() => {
  resetRateLimitStore();
});

describe("rateLimit", () => {
  it("allows requests up to the limit and reports remaining count", () => {
    const now = 1000;
    for (let i = 1; i <= 5; i++) {
      const r = rateLimit("user:a", 5, 60_000, now);
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(5 - i);
    }
  });

  it("denies the request that exceeds the limit", () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) rateLimit("user:a", 5, 60_000, now);
    // The 6th request is denied.
    const denied = rateLimit("user:a", 5, 60_000, now);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
  });

  it("resets the window after windowMs elapses (a fresh window allows again)", () => {
    // Burn the limit in the first window.
    for (let i = 0; i < 5; i++) rateLimit("user:a", 5, 60_000, 1000);
    // 70s later → a new window; requests allowed again.
    const r = rateLimit("user:a", 5, 60_000, 1000 + 70_000);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it("isolates keys (user a's usage does not affect user b)", () => {
    for (let i = 0; i < 5; i++) rateLimit("user:a", 5, 60_000, 1000);
    expect(rateLimit("user:a", 5, 60_000, 1000).allowed).toBe(false);
    expect(rateLimit("user:b", 5, 60_000, 1000).allowed).toBe(true);
  });

  it("reports a resetAt at windowStart + windowMs", () => {
    const r = rateLimit("user:a", 5, 60_000, 1000);
    expect(r.resetAt).toBe(1000 + 60_000);
  });

  it("a request exactly at windowStart + windowMs starts a fresh window", () => {
    for (let i = 0; i < 5; i++) rateLimit("user:a", 5, 60_000, 1000);
    // exactly at the boundary → new window
    const r = rateLimit("user:a", 5, 60_000, 1000 + 60_000);
    expect(r.allowed).toBe(true);
  });
});

describe("rateLimitKey", () => {
  it("prefers the authenticated user id", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(rateLimitKey(req, "user-123")).toBe("user:user-123");
  });

  it("falls back to x-forwarded-for IP when no user", () => {
    const req = new Request("https://example.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(rateLimitKey(req, null)).toBe("ip:1.2.3.4");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const req = new Request("https://example.com", {
      headers: { "x-real-ip": "9.9.9.9" },
    });
    expect(rateLimitKey(req, null)).toBe("ip:9.9.9.9");
  });

  it("uses 'unknown' when no IP header is present", () => {
    const req = new Request("https://example.com");
    expect(rateLimitKey(req, null)).toBe("ip:unknown");
  });
});
