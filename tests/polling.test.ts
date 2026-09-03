import test from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_POLL_POLICY,
  isRetryablePollStatus,
  pollDelayMs,
} from "../src/lib/polling";

test("Retry-After takes precedence over measured polling values", () => {
  assert.equal(pollDelayMs(0, 20, 30), 30_000);
  assert.equal(pollDelayMs(4, null, 30), 30_000);
  assert.equal(pollDelayMs(8, null, 30), 30_000);
});

test("uses the provider estimate only for the first poll", () => {
  assert.equal(pollDelayMs(0, 20), 20_000);
  assert.equal(pollDelayMs(1, 20), CHECK_POLL_POLICY.initialIntervalMs);
});

test("uses the measured fallback and slows down after ten seconds", () => {
  assert.equal(pollDelayMs(0, null), CHECK_POLL_POLICY.fallbackFirstDelayMs);
  assert.equal(pollDelayMs(1, null), 2_000);
  assert.equal(pollDelayMs(4, null), 2_000);
  assert.equal(pollDelayMs(5, null), 5_000);
  assert.equal(pollDelayMs(14, null), 5_000);
  assert.equal(CHECK_POLL_POLICY.maxAttempts, 15);
  assert.equal(CHECK_POLL_POLICY.maxConsecutiveErrors, 3);
});

test("uses measured retry delays after transient errors", () => {
  assert.equal(pollDelayMs(1, null, null, 1), 1_000);
  assert.equal(pollDelayMs(2, null, null, 2), 2_000);
  assert.equal(pollDelayMs(8, null, null, 2), 2_000);
});

test("Retry-After takes precedence over the transient error schedule", () => {
  assert.equal(pollDelayMs(3, null, 30, 1), 30_000);
});

test("retries only transient server failures", () => {
  assert.equal(isRetryablePollStatus(500), true);
  assert.equal(isRetryablePollStatus(503), true);
  assert.equal(isRetryablePollStatus(400), false);
  assert.equal(isRetryablePollStatus(401), false);
  assert.equal(isRetryablePollStatus(403), false);
  assert.equal(isRetryablePollStatus(404), false);
  assert.equal(isRetryablePollStatus(409), false);
  assert.equal(isRetryablePollStatus(502), false);
});
