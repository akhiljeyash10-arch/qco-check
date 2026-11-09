import { afterEach, describe, expect, it } from "vitest";
import { isS3Configured } from "@/lib/s3";

const AWS_ENV_KEYS = [
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_S3_BUCKET",
] as const;

const originalAwsEnv = Object.fromEntries(
  AWS_ENV_KEYS.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of AWS_ENV_KEYS) {
    const value = originalAwsEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("isS3Configured", () => {
  it("uses local fallback when any required S3 setting is missing", () => {
    for (const key of AWS_ENV_KEYS) delete process.env[key];
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_S3_BUCKET = "qco-check-test";

    expect(isS3Configured()).toBe(false);
  });

  it("returns true when the bucket, region, and explicit credentials are set", () => {
    process.env.AWS_REGION = "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "test-access-key";
    process.env.AWS_SECRET_ACCESS_KEY = "test-secret-key";
    process.env.AWS_S3_BUCKET = "qco-check-test";

    expect(isS3Configured()).toBe(true);
  });
});
