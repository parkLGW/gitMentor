import assert from "node:assert/strict";
import test from "node:test";

import { withKeepAlive } from "../services/extension-keepalive.js";

test("withKeepAlive pings while the task is running", async () => {
  let pingCount = 0;

  const result = await withKeepAlive(
    async () => {
      await new Promise((resolve) => setTimeout(resolve, 25));
      return "done";
    },
    async () => {
      pingCount += 1;
    },
    5,
  );

  assert.equal(result, "done");
  assert.ok(pingCount >= 2);
});

test("withKeepAlive clears the interval after the task rejects", async () => {
  let pingCount = 0;

  await assert.rejects(
    () =>
      withKeepAlive(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error("boom");
        },
        async () => {
          pingCount += 1;
        },
        5,
      ),
    /boom/,
  );

  const settledCount = pingCount;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(pingCount, settledCount);
});

test("withKeepAlive does not wait for ping completion before running the task", async () => {
  let taskStarted = false;

  const result = await withKeepAlive(
    async () => {
      taskStarted = true;
      return "done";
    },
    async () => {
      await new Promise(() => {});
    },
    5,
  );

  assert.equal(taskStarted, true);
  assert.equal(result, "done");
});
