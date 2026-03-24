import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSourceDeskPreviewFetchKey } from "../src/editor/sourceDeskPreviewChurn";

type FailureContext = {
  action: string;
  expected: string;
  likelyDriftPoint: string;
  observed: string;
  setup: string;
  title: string;
};

function caseFailure(context: FailureContext): string {
  return [
    `Case: ${context.title}`,
    `Setup: ${context.setup}`,
    `Action: ${context.action}`,
    `Observed: ${context.observed}`,
    `Expected: ${context.expected}`,
    `Likely drift point: ${context.likelyDriftPoint}`,
  ].join("\n");
}

function caseAssert(condition: boolean, context: FailureContext): void {
  assert.ok(condition, caseFailure(context));
}

async function stable_key_collapses_equivalent_preview_sets() {
  const first = buildSourceDeskPreviewFetchKey([
    "assets/image-map/candidates/a.png",
    "assets/image-map/candidates/b.png",
    "assets/image-map/candidates/a.png",
  ]);
  const second = buildSourceDeskPreviewFetchKey([
    "assets/image-map/candidates/b.png",
    " assets/image-map/candidates/a.png ",
  ]);

  caseAssert(
    first === second,
    {
      title: "stable preview key for equivalent set",
      setup: "Source Desk preview path list includes duplicates/order churn/whitespace noise.",
      action: "Compute preview fetch key across equivalent sets.",
      observed: "Equivalent sets produced different fetch keys.",
      expected: "Equivalent sets collapse to the same key to avoid duplicate fetch loops.",
      likelyDriftPoint: "buildSourceDeskPreviewFetchKey normalization/sorting logic.",
    },
  );
}

async function stable_key_changes_when_preview_set_changes() {
  const before = buildSourceDeskPreviewFetchKey([
    "assets/image-map/candidates/a.png",
    "assets/image-map/candidates/b.png",
  ]);
  const after = buildSourceDeskPreviewFetchKey([
    "assets/image-map/candidates/a.png",
    "assets/image-map/candidates/c.png",
  ]);

  caseAssert(
    before !== after,
    {
      title: "preview key changes on material set change",
      setup: "Source Desk preview path set changes to different asset membership.",
      action: "Compute preview fetch key before and after membership update.",
      observed: "Materially different sets produced the same key.",
      expected: "Key must change when preview membership changes so new previews can load.",
      likelyDriftPoint: "buildSourceDeskPreviewFetchKey uniqueness/ordering implementation.",
    },
  );
}

async function source_desk_effect_depends_on_stable_key() {
  const source = await readFile(
    "d:/nursery/nursery/apps/hammer/src/editor/HammerWorkspaceShell.tsx",
    "utf-8",
  );

  caseAssert(
    source.includes("const sourceDeskPreviewFetchKey = useMemo(")
      && source.includes("buildSourceDeskPreviewFetchKey(sourceDeskPreviewFetchPaths)"),
    {
      title: "stable Source Desk preview key memo",
      setup: "Hammer workspace shell computes Source Desk preview dependencies.",
      action: "Inspect memoized preview key source.",
      observed: "Stable key memoization is missing or bypassed.",
      expected: "Preview effect should derive a stable key from preview fetch paths.",
      likelyDriftPoint: "Source Desk preview key derivation in HammerWorkspaceShell.",
    },
  );

  caseAssert(
    source.includes("}, [launchContext.workpiece_id, sourceDeskPreviewFetchKey]);")
      && !source.includes("}, [launchContext.workpiece_id, sourceDeskPreviewPaths]);"),
    {
      title: "preview effect boundary keyed by stable fingerprint",
      setup: "Equivalent parent rerenders can churn array/object identity.",
      action: "Inspect Source Desk preview effect dependency array.",
      observed: "Preview effect still depends on raw preview path array identity.",
      expected: "Effect must depend on stable key to avoid repeated refetch cascades.",
      likelyDriftPoint: "Source Desk preview useEffect dependency array.",
    },
  );
}

async function run() {
  await stable_key_collapses_equivalent_preview_sets();
  await stable_key_changes_when_preview_set_changes();
  await source_desk_effect_depends_on_stable_key();
  // eslint-disable-next-line no-console
  console.log("Hammer Source Desk preview churn tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Source Desk preview churn tests failed:", error);
  process.exit(1);
});
