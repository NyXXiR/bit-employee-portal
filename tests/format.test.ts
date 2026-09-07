import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime } from "../src/lib/format";

test("Seoul time uses 24-hour output without environment-dependent AM/PM translations", () => {
  const afternoon = formatDateTime("2026-09-07T05:44:00Z");
  assert.match(afternoon!, /14:44/);
  assert.doesNotMatch(afternoon!, /AM|PM|오전|오후/);
  assert.match(formatDateTime("2026-09-06T15:00:00Z")!, /00:00/);
});
