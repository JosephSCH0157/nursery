import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { TongsCommitService } from "../../../packages/tongs/src/workpiece-commit-api";
import {
  assertMutableSupabaseTarget,
} from "../scripts/supabase-target-authority.mjs";
import {
  WORKPIECE_JOB_RUNNER_ENABLE_ENV,
  resolveWorkpieceJobRunnerAuthority,
} from "../scripts/workpiece-job-runner-authority";
import {
  startWorkpieceJobRunner,
} from "../server/tongs/workpiece-job-runner";

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const testDeps = { service: {} as TongsCommitService };

test("ordinary Vite startup is disabled while explicit local and allowlisted startup are authorized", () => {
  assert.deepEqual(
    resolveWorkpieceJobRunnerAuthority({}, "https://persistent-project.supabase.co"),
    { enabled: false },
  );
  assert.deepEqual(
    resolveWorkpieceJobRunnerAuthority(
      { [WORKPIECE_JOB_RUNNER_ENABLE_ENV]: "1" },
      "http://127.0.0.1:54321",
    ),
    {
      enabled: true,
      projectRef: "local",
      targetKey: "http://127.0.0.1:54321",
    },
  );
  assert.equal(
    resolveWorkpieceJobRunnerAuthority(
      {
        [WORKPIECE_JOB_RUNNER_ENABLE_ENV]: "1",
        FORGE_NONPROD_SUPABASE_PROJECT_REFS: "approved-project",
      },
      "https://approved-project.supabase.co",
    ).enabled,
    true,
  );
  assert.throws(
    () => resolveWorkpieceJobRunnerAuthority(
      { [WORKPIECE_JOB_RUNNER_ENABLE_ENV]: "1" },
      "https://persistent-project.supabase.co",
    ),
    /unapproved persistent Supabase project persistent-project/,
  );
});

test("runner disposal stops polling and target rebinding disposes the old runner", async () => {
  let firstTicks = 0;
  const first = await startWorkpieceJobRunner(testDeps, {
    targetKey: "http://127.0.0.1:54321",
    pollIntervalMs: 5,
    testOnlyTick: async () => { firstTicks += 1; },
  });
  await wait(25);
  assert.ok(firstTicks > 0);
  await first.dispose();
  const stoppedAt = firstTicks;
  await wait(20);
  assert.equal(firstTicks, stoppedAt);
  assert.equal(first.isActive(), false);

  let oldTargetTicks = 0;
  let newTargetTicks = 0;
  let releaseOldTargetTick = () => {};
  let markOldTargetTickStarted = () => {};
  const oldTargetTickStarted = new Promise<void>((resolve) => { markOldTargetTickStarted = resolve; });
  const oldTargetTickRelease = new Promise<void>((resolve) => { releaseOldTargetTick = resolve; });
  const oldTarget = await startWorkpieceJobRunner(testDeps, {
    targetKey: "http://127.0.0.1:54321",
    pollIntervalMs: 5,
    testOnlyTick: async () => {
      oldTargetTicks += 1;
      markOldTargetTickStarted();
      await oldTargetTickRelease;
    },
  });
  await oldTargetTickStarted;
  let rebindSettled = false;
  const rebind = startWorkpieceJobRunner(testDeps, {
    targetKey: "http://localhost:54321",
    pollIntervalMs: 5,
    testOnlyTick: async () => { newTargetTicks += 1; },
  });
  void rebind.then(() => { rebindSettled = true; });
  await wait(10);
  assert.equal(rebindSettled, false, "rebind must wait for the old target's active tick");
  releaseOldTargetTick();
  const newTarget = await rebind;
  assert.equal(oldTarget.isActive(), false);
  const oldTargetStoppedAt = oldTargetTicks;
  await wait(20);
  assert.equal(oldTargetTicks, oldTargetStoppedAt);
  assert.ok(newTargetTicks > 0);
  await newTarget.dispose();
});

test("mutable-target authority rejects persistent defaults and permits local or approved targets", () => {
  assert.equal(assertMutableSupabaseTarget("http://localhost:54321", null), "local");
  assert.equal(
    assertMutableSupabaseTarget(
      "https://approved-project.supabase.co",
      "other-project,approved-project",
    ),
    "approved-project",
  );
  assert.throws(
    () => assertMutableSupabaseTarget("https://blocked-project.supabase.co", null),
    /unapproved persistent Supabase project blocked-project/,
  );
});

test("target-authority failures do not disclose credentials", () => {
  const credential = "service-role-secret-value";
  assert.throws(
    () => assertMutableSupabaseTarget(
      `https://${credential}@blocked-project.supabase.co`,
      null,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, new RegExp(credential));
      assert.match(error.message, /blocked-project/);
      return true;
    },
  );
});

test("each audited mutable command checks authority before its service-role client", async () => {
  const cases = [
    ["../playwright/adaptive_style_ui_matrix.spec.ts", "const adminClient = createClient"],
    ["../playwright/hearth.thumbnail-v3.spec.ts", "const admin = createClient"],
    ["../playwright/brand-media-live.spec.ts", "const admin = createClient"],
    ["../scripts/verify-ai-policy-live.mts", "const admin = createClient"],
    ["../../../packages/tongs/scripts/verify-thumbnail-lifecycle-live.mjs", "const admin = createClient"],
  ] as const;
  for (const [relativePath, mutableClientMarker] of cases) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    const guardCall = source.indexOf("assertMutableSupabaseTarget(");
    const mutableClient = source.indexOf(mutableClientMarker);
    assert.ok(guardCall >= 0, `${relativePath} has no target-authority call`);
    assert.ok(mutableClient > guardCall, `${relativePath} creates its service client before target authority`);
  }
});

test("Vite server shutdown and watcher reload both dispose the owned Tongs middleware", async () => {
  const source = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(source, /server\.httpServer\?\.once\("close", disposeTongsMiddleware\)/);
  assert.match(source, /server\.watcher\.once\("close", disposeTongsMiddleware\)/);
  assert.match(source, /void tongsMiddleware\.dispose\(\)/);
});
