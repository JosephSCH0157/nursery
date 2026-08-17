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
    new URL("../src/editor/useHammerWorkspaceShellSourceDeskController.ts", import.meta.url),
    "utf-8",
  );
  const hookSource = await readFile(
    new URL("../src/editor/hammerWorkspaceShellSourceDeskPreviews.ts", import.meta.url),
    "utf-8",
  );

  caseAssert(
    source.includes("const sourceDeskPreviewFetchKey = useMemo(")
      && source.includes("buildSourceDeskPreviewFetchKey(sourceDeskAllRequestedPreviewPaths)"),
    {
      title: "stable Source Desk preview key memo",
      setup: "Hammer workspace shell computes Source Desk preview dependencies.",
      action: "Inspect memoized preview key source.",
      observed: "Stable key memoization is missing or bypassed.",
      expected: "Preview effect should derive a stable key from preview fetch paths.",
      likelyDriftPoint: "Source Desk preview key derivation in its authority controller.",
    },
  );

  caseAssert(
    source.includes("useHammerWorkspaceShellSourceDeskPreviews({")
      && source.includes("fetchKey: sourceDeskPreviewFetchKey")
      && hookSource.includes("}, [args.workpieceId, args.fetchKey]);")
      && !hookSource.includes("}, [args.workpieceId, args.previewPaths]);"),
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

async function stale_preview_completion_is_rejected_and_cleaned_up() {
  const source = await readFile(new URL("../src/editor/hammerWorkspaceShellSourceDeskPreviews.ts", import.meta.url), "utf-8");
  const controller = await readFile(new URL("../src/editor/useHammerWorkspaceShellSourceDeskController.ts", import.meta.url), "utf-8");
  assert.match(source, /if \(!active\) \{[\s\S]*URL\.revokeObjectURL/);
  assert.match(source, /URL\.revokeObjectURL\(merged\[key\]\)/);
  assert.match(source, /\[args\.workpieceId, args\.fetchKey\]/);
  assert.match(controller, /setPreviewRequestRevision\(\(current\) => current \+ 1\)/);
  assert.match(controller, /refreshRunId !== refreshRunIdRef\.current/);
  assert.match(controller, /backgroundReplacementAssetPath/);
}

async function source_desk_authority_does_not_leak_back_to_shell() {
  const shell = await readFile(new URL("../src/editor/HammerWorkspaceShell.tsx", import.meta.url), "utf-8");
  const controller = await readFile(new URL("../src/editor/useHammerWorkspaceShellSourceDeskController.ts", import.meta.url), "utf-8");
  assert.doesNotMatch(shell, /useState<HammerStoredMediaFile|const \[sourceDeskLoading|const \[sourceDeskPreviewUrls|const imageUploadInputRef = useRef/);
  assert.match(controller, /Source Desk authority owns media loading, upload coordination, stored-media synchronization/);
  assert.doesNotMatch(controller, /derive.*MediaMap|resolveHammerAutomaticPlacementCommand|buildSourceBayVM|onWorkspaceSnapshotChange/);
}

async function timeline_transforms_do_not_request_preview_media() {
  const visualEditingSource = await readFile(
    new URL("../src/editor/useHammerWorkspaceShellVisualEditing.ts", import.meta.url),
    "utf-8",
  );
  const dragEffectMatch = visualEditingSource.match(
    /if \(!timelineImageDragState\) return;([\s\S]*?)useEffect\(\(\) => \{\s*if \(!previewCanvasDragState\) return;/,
  );
  const dragEffectSlice = dragEffectMatch?.[1] ?? "";

  caseAssert(
    dragEffectSlice.length > 0 && !dragEffectSlice.includes("loadWorkpieceMediaPreviewUrl("),
    {
      title: "timeline transform path is metadata-only",
      setup: "Drag/resize timeline interactions should be geometry/timing transforms only.",
      action: "Inspect timeline image drag effect implementation.",
      observed: "Timeline transform path contains media preview fetch calls.",
      expected: "No media fetch calls are allowed during timeline transform effects.",
      likelyDriftPoint: "Timeline drag/resize useEffect in useHammerWorkspaceShellVisualEditing.",
    },
  );
}

async function run() {
  await stable_key_collapses_equivalent_preview_sets();
  await stable_key_changes_when_preview_set_changes();
  await source_desk_effect_depends_on_stable_key();
  await stale_preview_completion_is_rejected_and_cleaned_up();
  await source_desk_authority_does_not_leak_back_to_shell();
  await timeline_transforms_do_not_request_preview_media();
  // eslint-disable-next-line no-console
  console.log("Hammer Source Desk preview churn tests passed.");
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Hammer Source Desk preview churn tests failed:", error);
  process.exit(1);
});
