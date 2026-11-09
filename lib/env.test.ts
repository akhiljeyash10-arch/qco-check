import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv, loadAppEnv, missingEnvVars } from "@/lib/env";

/**
 * Clean env handling unit tests.
 *
 * Verifies the env helpers fail loudly with clear messages when required
 * variables are missing/blank/too-short, and report the set of missing vars
 * for the health check. `process.env` is saved/restored around each case so
 * tests are isolated and deterministic.
 */

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  // Start each case with a clean slate for the vars under test.
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SECRET;
  delete process.env.AUTH_URL;
  delete process.env.AWS_REGION;
  delete process.env.AWS_ACCESS_KEY_ID;
  delete process.env.AWS_SECRET_ACCESS_KEY;
  delete process.env.AWS_S3_BUCKET;
});

afterEach(() => {
  // Restore the original environment exactly.
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("requireEnv", () => {
  it("returns the value when present and non-empty", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    expect(requireEnv("DATABASE_URL")).toBe("postgresql://localhost/db");
  });

  it("trims surrounding whitespace", () => {
    process.env.DATABASE_URL = "  postgresql://localhost/db  ";
    expect(requireEnv("DATABASE_URL")).toBe("postgresql://localhost/db");
  });

  it("throws a clear error naming the variable when missing", () => {
    expect(() => requireEnv("DATABASE_URL")).toThrow(/DATABASE_URL/);
    expect(() => requireEnv("DATABASE_URL")).toThrow(/Missing required/);
  });

  it("throws when the value is blank", () => {
    process.env.DATABASE_URL = "   ";
    expect(() => requireEnv("DATABASE_URL")).toThrow(/Missing required/);
  });

  it("enforces a minimum length when provided", () => {
    process.env.AUTH_SECRET = "short";
    expect(() => requireEnv("AUTH_SECRET", 32)).toThrow(/too short/);
  });

  it("accepts a value meeting the minimum length", () => {
    process.env.AUTH_SECRET = "a".repeat(32);
    expect(requireEnv("AUTH_SECRET", 32)).toBe("a".repeat(32));
  });
});

describe("loadAppEnv", () => {
  it("returns both validated vars when present and valid (dev env, no AUTH_URL required)", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(40);
    // NODE_ENV is "test" here, so AUTH_URL is optional.
    const env = loadAppEnv();
    expect(env.databaseUrl).toBe("postgresql://localhost/db");
    expect(env.authSecret).toBe("a".repeat(40));
  });

  it("includes AUTH_URL in result when provided", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.AUTH_URL = "https://qcocheck.example.com";
    const env = loadAppEnv();
    expect(env.authUrl).toBe("https://qcocheck.example.com");
  });

  it("includes optional AWS configuration when provided", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.AWS_S3_BUCKET = "qco-check-test";

    const env = loadAppEnv();
    expect(env.awsRegion).toBe("us-east-1");
    expect(env.awsAccessKeyId).toBe("test-access-key");
    expect(env.awsSecretAccessKey).toBe("test-secret-key");
    expect(env.awsS3Bucket).toBe("qco-check-test");
  });

  it("throws when DATABASE_URL is missing", () => {
    process.env.AUTH_SECRET = "a".repeat(40);
    expect(() => loadAppEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when AUTH_SECRET is too short", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "tiny";
    expect(() => loadAppEnv()).toThrow(/AUTH_SECRET.*too short/);
  });

  it("throws in production when AUTH_URL is missing", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(40);
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(() => loadAppEnv()).toThrow(/AUTH_URL/);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        origNodeEnv;
    }
  });

  it("does not throw in production when AUTH_URL is provided", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(40);
    process.env.AUTH_URL = "https://qcocheck.example.com";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      const env = loadAppEnv();
      expect(env.authUrl).toBe("https://qcocheck.example.com");
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        origNodeEnv;
    }
  });
});

describe("missingEnvVars", () => {
  it("reports both vars missing", () => {
    expect(missingEnvVars()).toEqual(
      expect.arrayContaining(["DATABASE_URL", "AUTH_SECRET"]),
    );
  });

  it("reports AUTH_SECRET as too short (not just missing)", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "tiny";
    expect(missingEnvVars()).toEqual(["AUTH_SECRET (too short)"]);
  });

  it("returns an empty array when everything is present and valid (dev)", () => {
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(32);
    // NODE_ENV is "test" so AUTH_URL is not required.
    expect(missingEnvVars()).toEqual([]);
  });

  it("reports AUTH_URL missing in production", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(32);
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(missingEnvVars()).toEqual(
        expect.arrayContaining(["AUTH_URL (required in production)"]),
      );
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        origNodeEnv;
    }
  });

  it("does not report AUTH_URL when provided in production", () => {
    const origNodeEnv = process.env.NODE_ENV;
    process.env.DATABASE_URL = "postgresql://localhost/db";
    process.env.AUTH_SECRET = "a".repeat(32);
    process.env.AUTH_URL = "https://qcocheck.example.com";
    (process.env as Record<string, string | undefined>).NODE_ENV = "production";
    try {
      expect(missingEnvVars()).toEqual([]);
    } finally {
      (process.env as Record<string, string | undefined>).NODE_ENV =
        origNodeEnv;
    }
  });
});
