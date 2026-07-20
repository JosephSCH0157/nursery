import assert from "node:assert/strict";
import test from "node:test";
import {
  maxHammerQuenchReadinessStatus,
  mergeReadinessReasons,
  resolveMonotonicReadiness,
} from "../hammer/quench-readiness-taxonomy.contract";

test("readiness severity is monotonic", () => {
  const statuses = ["ready", "needs_review", "blocked"] as const;
  const expected = {
    ready: { ready: "ready", needs_review: "needs_review", blocked: "blocked" },
    needs_review: { ready: "needs_review", needs_review: "needs_review", blocked: "blocked" },
    blocked: { ready: "blocked", needs_review: "blocked", blocked: "blocked" },
  } as const;
  for (const upstream of statuses) {
    for (const local of statuses) {
      assert.equal(maxHammerQuenchReadinessStatus(upstream, local), expected[upstream][local], `${upstream}/${local}`);
      const localReasons = local === "ready" ? [] : [{
        code: `local_${local}`,
        severity: local === "blocked" ? "blocking" as const : "review" as const,
        source: "quench",
      }];
      const resolved = resolveMonotonicReadiness({
        upstreamStatus: upstream,
        upstreamReasons: upstream === "ready" ? [] : [{
          code: `upstream_${upstream}`,
          severity: upstream === "blocked" ? "blocking" as const : "review" as const,
          source: "handoff",
        }],
        downstreamReasons: localReasons,
      });
      assert.equal(resolved.status, expected[upstream][local], `resolver ${upstream}/${local}`);
      assert.equal(resolved.readyForQuench, expected[upstream][local] === "ready", `flag ${upstream}/${local}`);
    }
  }
});

test("downstream review evidence never improves upstream blocked", () => {
  const result = resolveMonotonicReadiness({
    upstreamStatus: "blocked",
    upstreamReasons: [{ code: "handoff_blocked", severity: "blocking" as const, source: "handoff" }],
    downstreamReasons: [{ code: "quench_visuals_missing", severity: "review" as const, source: "quench" }],
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.readyForQuench, false);
});

test("reason merge deduplicates by code and preserves strongest severity", () => {
  const reasons = mergeReadinessReasons(
    [{ code: "same", severity: "review" as const, source: "packet" }],
    [{ code: "same", severity: "blocking" as const, source: "packet" }],
  );
  assert.deepEqual(reasons, [{ code: "same", severity: "blocking", source: "packet" }]);
});

test("blocking evidence fails closed even when its declared upstream status is inconsistent", () => {
  const result = resolveMonotonicReadiness({
    upstreamStatus: "ready",
    upstreamReasons: [{ code: "handoff_blocked", severity: "blocking", source: "handoff" }],
    downstreamReasons: [],
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.readyForQuench, false);
});

test("same code from different evidence sources is preserved", () => {
  const reasons = mergeReadinessReasons(
    [{ code: "same", severity: "review" as const, source: "packet" }],
    [{ code: "same", severity: "blocking" as const, source: "quench" }],
  );
  assert.equal(reasons.length, 2);
  assert.deepEqual(reasons.map((reason) => reason.source), ["packet", "quench"]);
});
