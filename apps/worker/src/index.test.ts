import { describe, expect, it } from "vitest";
import { buildRetryPlan, classifyWorkerFailure } from "./retry.js";

describe("worker smoke", () => {
  it("passes baseline test", () => {
    expect(1 + 1).toBe(2);
  });
});

describe("classifyWorkerFailure", () => {
  it("marks network-like failures as retryable transient infra", () => {
    const out = classifyWorkerFailure(new Error("docker timed out after 120000ms"));
    expect(out).toEqual({ category: "TRANSIENT_INFRA", retryable: true });
  });

  it("marks auth failures as non-retryable", () => {
    const out = classifyWorkerFailure(new Error("access denied: unauthorized"));
    expect(out).toEqual({ category: "AUTHORIZATION", retryable: false });
  });

  it("marks unsupported option failures as non-retryable", () => {
    const out = classifyWorkerFailure(new Error("unknown option --categories"));
    expect(out).toEqual({ category: "UNSUPPORTED", retryable: false });
  });

  it("marks malformed config failures as non-retryable", () => {
    const out = classifyWorkerFailure(new Error("malformed config payload: failed to parse"));
    expect(out).toEqual({ category: "CONFIGURATION", retryable: false });
  });
});

describe("buildRetryPlan", () => {
  it("queues retry for transient failure under retry limit", () => {
    const out = buildRetryPlan({
      existingMetadata: {},
      error: new Error("network unreachable"),
      maxRetries: 2,
      runtime: "docker",
      nowIso: "2026-02-17T00:00:00.000Z"
    });
    expect(out.canRetry).toBe(true);
    expect(out.attempt).toBe(1);
    expect((out.metadata.worker as Record<string, unknown>).state).toBe("QUEUED_FOR_RETRY");
  });

  it("fails non-retryable authorization errors immediately", () => {
    const out = buildRetryPlan({
      existingMetadata: {},
      error: new Error("access denied"),
      maxRetries: 2,
      runtime: "docker",
      nowIso: "2026-02-17T00:00:00.000Z"
    });
    expect(out.canRetry).toBe(false);
    expect((out.metadata.worker as Record<string, unknown>).state).toBe("FAILED");
  });

  it("fails once retry budget is exhausted", () => {
    const out = buildRetryPlan({
      existingMetadata: { worker: { attempt: 2 }, profile: { compliance: ["CIS"] } },
      error: new Error("timeout"),
      maxRetries: 2,
      runtime: "docker",
      nowIso: "2026-02-17T00:00:00.000Z"
    });
    expect(out.canRetry).toBe(false);
    expect(out.attempt).toBe(3);
    expect(out.metadata.profile).toEqual({ compliance: ["CIS"] });
    expect((out.metadata.worker as Record<string, unknown>).state).toBe("FAILED");
  });
});
