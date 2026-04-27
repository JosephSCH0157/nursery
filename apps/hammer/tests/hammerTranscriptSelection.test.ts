import assert from "node:assert/strict";
import { decideHammerTranscriptHydrationSource } from "../src/editor/hammerTranscriptSelection";

async function testPrefersRevisionWhenRegisteredIsNotMateriallyBetter() {
  const decision = decideHammerTranscriptHydrationSource({
    registered: { load_ok: true, segment_count: 40, definitively_bad: false },
    revision: { load_ok: true, segment_count: 50 },
    baseline: { load_ok: true, segment_count: 60 },
  });
  assert.equal(decision.selected_source, "revision_transcript");
  assert.equal(decision.downgrade_guard_applied, false);
}

async function testDowngradeGuardPrefersRegisteredWhenMateriallyBetter() {
  const decision = decideHammerTranscriptHydrationSource({
    registered: { load_ok: true, segment_count: 120, definitively_bad: false },
    revision: { load_ok: true, segment_count: 14 },
    baseline: { load_ok: true, segment_count: 80 },
  });
  assert.equal(decision.selected_source, "registered_transcript");
  assert.equal(decision.downgrade_guard_applied, true);
}

async function testPrefersBaselineWhenRegisteredIsOnlyOptionAndMateriallyWorse() {
  const decision = decideHammerTranscriptHydrationSource({
    registered: { load_ok: true, segment_count: 14, definitively_bad: false },
    revision: { load_ok: false, segment_count: null },
    baseline: { load_ok: true, segment_count: 80 },
  });
  assert.equal(decision.selected_source, "canonical_baseline");
  assert.equal(decision.downgrade_guard_applied, true);
}

async function testFallsBackWhenRegisteredNotViable() {
  const decision = decideHammerTranscriptHydrationSource({
    registered: { load_ok: false, segment_count: null, definitively_bad: false },
    revision: { load_ok: true, segment_count: 55 },
    baseline: { load_ok: true, segment_count: 70 },
  });
  assert.equal(decision.selected_source, "revision_transcript");
  assert.equal(decision.downgrade_guard_applied, false);
}

async function run() {
  await testPrefersRevisionWhenRegisteredIsNotMateriallyBetter();
  await testDowngradeGuardPrefersRegisteredWhenMateriallyBetter();
  await testPrefersBaselineWhenRegisteredIsOnlyOptionAndMateriallyWorse();
  await testFallsBackWhenRegisteredNotViable();
  // eslint-disable-next-line no-console
  console.log("Hammer transcript selection tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer transcript selection tests failed:", error);
  process.exit(1);
});

