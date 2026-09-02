import test from "node:test";
import assert from "node:assert/strict";
import { AppError, routeError } from "../src/server/errors";

test("503 error exposes Retry-After in both the header and JSON contract", async () => {
  const response = routeError(
    new AppError(503, "BACKGROUND_CHECK_UNAVAILABLE", "잠시 후 다시 시도해 주세요.", 30),
  );

  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "30");
  assert.deepEqual(await response.json(), {
    statusCode: 503,
    code: "BACKGROUND_CHECK_UNAVAILABLE",
    message: "잠시 후 다시 시도해 주세요.",
    retryAfter: 30,
  });
});

test("ordinary application errors do not invent a retry delay", async () => {
  const response = routeError(new AppError(409, "CONFLICT", "충돌했습니다."));
  assert.equal(response.headers.get("retry-after"), null);
  assert.deepEqual(await response.json(), {
    statusCode: 409,
    code: "CONFLICT",
    message: "충돌했습니다.",
  });
});
