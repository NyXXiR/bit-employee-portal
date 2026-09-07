import test from "node:test";
import assert from "node:assert/strict";
import { automaticPollDelayMs, nextPollAtMs, isRetryablePollStatus } from "../src/lib/polling";
import { retryAfterSeconds } from "../src/domain/background-check";

test("first lookup at 4s, then 2s after each response; no burst and at most 88 starts", () => {
  let now = 0;
  let next: number | null = null;
  const starts: number[] = [];
  for (;;) {
    const delay = automaticPollDelayMs(now, 0, next);
    if (delay === null) break;
    now += delay;
    starts.push(now);
    next = nextPollAtMs(now);
  }
  assert.equal(starts.length, 88);
  assert.equal(starts[0], 4_000);
  assert.equal(starts.at(-1), 178_000);
  assert.equal(nextPollAtMs(5_000), 7_000);
});

test("advice survives rescheduling; reaching 180s stops automatic lookup only", () => {
  const next = nextPollAtMs(160_000, 30);
  assert.equal(next, 190_000);
  assert.equal(automaticPollDelayMs(160_000, 0, next), null);
  assert.equal(automaticPollDelayMs(180_000, 0, 178_000), null);
  assert.equal(automaticPollDelayMs(10_000, 0, 34_000), 24_000);
  assert.equal(nextPollAtMs(4_000, 0), 6_000);
});

test("valid Retry-After header takes priority; malformed values fall back to body", () => {
  const now = Date.parse("2026-09-07T00:00:00Z");
  assert.equal(retryAfterSeconds("30", 45, now), 30);
  assert.equal(retryAfterSeconds("Mon, 07 Sep 2026 00:00:40 GMT", 30, now), 40);
  assert.equal(retryAfterSeconds("Sun, 06 Sep 2026 23:59:59 GMT", 30, now), 0);
  for (const header of [null, "", " ", "-1", "1.2", "1e2", "invalid"]) {
    assert.equal(retryAfterSeconds(header, 30, now), 30);
  }
  for (const body of [true, false, [], {}, " ", -1, 1.2, Infinity]) {
    assert.equal(retryAfterSeconds(null, body, now), undefined);
  }
});

test("input/auth/404/contract errors stop automatic polling; transient errors do not", () => {
  for (const status of [500, 503]) assert.equal(isRetryablePollStatus(status), true);
  for (const status of [400, 401, 403, 404, 409, 502]) assert.equal(isRetryablePollStatus(status), false);
});
