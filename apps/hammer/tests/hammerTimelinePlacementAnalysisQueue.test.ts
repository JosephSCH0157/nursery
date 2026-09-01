import assert from "node:assert/strict";
import test from "node:test";
import { TimelinePlacementAnalysisQueue, type TimelinePlacementAnalysisWorkItem } from "../src/features/auto-placement/timelinePlacementAnalysisQueue";

function item(placementId: string, time: number, revision = "canonical-1"): TimelinePlacementAnalysisWorkItem {
  return Object.freeze({ placementId, sessionIdentity: "workpiece-1", sourceIdentity: "media-1", compositionPresentationTimeSec: time,
    sourceMediaTimeSec: time, canonicalRevision: revision, mediaRevision: "media-rev-1", geometryRevision: "geometry-1" });
}

test("timeline placement queue consumes deterministically and serially", () => {
  const queue = new TimelinePlacementAnalysisQueue<{ leftPct: number }>();
  queue.reconcile([item("later", 20), item("same-b", 10), item("same-a", 10)]);
  assert.equal(queue.takeNext()?.placementId, "same-a");
  assert.equal(queue.takeNext(), null);
  const active = queue.snapshot().find((entry) => entry.item.placementId === "same-a")!;
  assert.equal(queue.settle({ item: active.item, status: "resolved-safe", resolvedTransform: { leftPct: 4 } }), true);
  assert.equal(queue.takeNext()?.placementId, "same-b");
});

test("revision changes invalidate one placement and reject superseded completion", () => {
  const queue = new TimelinePlacementAnalysisQueue();
  const original = item("placement-1", 10);
  queue.reconcile([original, item("placement-2", 20)]);
  assert.equal(queue.takeNext()?.placementId, "placement-1");
  const revised = item("placement-1", 10, "canonical-2");
  queue.reconcile([revised, item("placement-2", 20)]);
  assert.equal(queue.settle({ item: original, status: "safe-existing" }), false);
  assert.equal(queue.takeNext()?.canonicalRevision, "canonical-2");
  assert.equal(queue.snapshot().find((entry) => entry.item.placementId === "placement-2")?.status, "queued");
});

test("selection-free reconciliation removes deleted work and cancellation requeues active work", () => {
  const queue = new TimelinePlacementAnalysisQueue();
  queue.reconcile([item("a", 1), item("b", 2)]);
  assert.equal(queue.takeNext()?.placementId, "a");
  queue.cancelActive();
  assert.equal(queue.takeNext()?.placementId, "a");
  queue.reconcile([item("b", 2)]);
  assert.deepEqual(queue.snapshot().map((entry) => entry.item.placementId), ["b"]);
});

test("equivalent reconciliation deduplicates completed work and reset is deterministic", () => {
  const queue = new TimelinePlacementAnalysisQueue();
  const work = item("a", 1);
  queue.reconcile([work, work]);
  const active = queue.takeNext()!;
  assert.equal(queue.settle({ item: active, status: "safe-existing" }), true);
  queue.reconcile([item("a", 1)]);
  assert.equal(queue.takeNext(), null);
  assert.equal(queue.snapshot()[0]?.status, "safe-existing");
  queue.reset(); queue.reset();
  assert.deepEqual(queue.snapshot(), []);
});
