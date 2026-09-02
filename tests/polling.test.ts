import test from "node:test";
import assert from "node:assert/strict";
import { CHECK_POLL_POLICY, pollDelayMs } from "../src/lib/polling";

test("Retry-After takes precedence over provisional polling values", () => {
  assert.equal(pollDelayMs(0, 20, 30), 30_000);
  assert.equal(pollDelayMs(4, null, 30), 30_000);
});

test("existing provisional policy remains unchanged without Retry-After", () => {
  assert.equal(pollDelayMs(0, 20), 20_000);
  assert.equal(pollDelayMs(0, null), CHECK_POLL_POLICY.fallbackFirstDelayMs);
  assert.equal(pollDelayMs(1, 20), CHECK_POLL_POLICY.intervalMs);
});
