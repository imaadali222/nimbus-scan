export type FailureCategory =
  | "TRANSIENT_INFRA"
  | "AUTHORIZATION"
  | "CONFIGURATION"
  | "UNSUPPORTED"
  | "UNKNOWN";

type FailureClassification = {
  category: FailureCategory;
  retryable: boolean;
};

type RetryPlanParams = {
  existingMetadata?: Record<string, unknown>;
  error: unknown;
  maxRetries: number;
  runtime: "docker" | "local";
  nowIso?: string;
};

export type RetryPlan = {
  errorMessage: string;
  attempt: number;
  canRetry: boolean;
  failure: FailureClassification;
  metadata: Record<string, unknown>;
};

function includesAny(text: string, patterns: string[]) {
  return patterns.some((pattern) => text.includes(pattern));
}

export function classifyWorkerFailure(error: unknown): FailureClassification {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error ?? "").toLowerCase();

  if (
    includesAny(message, [
      "timed out",
      "timeout",
      "econn",
      "eai_again",
      "enotfound",
      "network",
      "socket",
      "unreachable",
      "too many requests",
      "rate limit",
      "temporarily unavailable",
      "service unavailable",
      "upstream api unreachable"
    ])
  ) {
    return { category: "TRANSIENT_INFRA", retryable: true };
  }

  if (
    includesAny(message, [
      "unauthorized",
      "forbidden",
      "not authorized",
      "access denied",
      "invalid credentials",
      "auth failed",
      "expired token"
    ])
  ) {
    return { category: "AUTHORIZATION", retryable: false };
  }

  if (
    includesAny(message, [
      "unknown option",
      "unrecognized",
      "no such option",
      "unsupported",
      "invalid choice",
      "unexpected argument"
    ])
  ) {
    return { category: "UNSUPPORTED", retryable: false };
  }

  if (
    includesAny(message, [
      "missing",
      "must be",
      "required",
      "malformed",
      "invalid",
      "failed to parse"
    ])
  ) {
    return { category: "CONFIGURATION", retryable: false };
  }

  return { category: "UNKNOWN", retryable: true };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function buildRetryPlan({ existingMetadata, error, maxRetries, runtime, nowIso }: RetryPlanParams): RetryPlan {
  const message = error instanceof Error ? error.message : "Unknown worker error";
  const failure = classifyWorkerFailure(error);
  const now = nowIso ?? new Date().toISOString();
  const metadata = existingMetadata ?? {};
  const existingWorkerMetadata = asRecord(metadata.worker);
  const previousAttempts =
    typeof existingWorkerMetadata.attempt === "number" && Number.isFinite(existingWorkerMetadata.attempt)
      ? existingWorkerMetadata.attempt
      : 0;
  const attempt = previousAttempts + 1;
  const canRetry = failure.retryable && attempt <= maxRetries;

  const workerMetadata = {
    attempt,
    maxRetries,
    failureCategory: failure.category,
    retryable: failure.retryable,
    lastError: message,
    updatedAt: now
  };

  if (canRetry) {
    return {
      errorMessage: message,
      attempt,
      canRetry: true,
      failure,
      metadata: {
        ...metadata,
        worker: { ...existingWorkerMetadata, ...workerMetadata, state: "QUEUED_FOR_RETRY" }
      }
    };
  }

  return {
    errorMessage: message,
    attempt,
    canRetry: false,
    failure,
    metadata: {
      ...metadata,
      runtime,
      profile: metadata.profile ?? null,
      error: message,
      failedAt: now,
      worker: { ...existingWorkerMetadata, ...workerMetadata, state: "FAILED" }
    }
  };
}
