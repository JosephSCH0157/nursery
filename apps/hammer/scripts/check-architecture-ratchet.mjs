import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(readFileSync(join(root, "architecture-baseline.json"), "utf8"));
const failures = [];

function inspect(relativePath) {
  const path = join(root, relativePath);
  const text = readFileSync(path, "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  let explicitAny = 0;
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAny += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { text, lines: text.split(/\r?\n/).length, explicitAny };
}

for (const [path, limit] of Object.entries(baseline.principalFiles)) {
  const current = inspect(path);
  if (current.lines > limit.maxLines) failures.push(`${path}: responsibility concentration grew to ${current.lines} lines (cap ${limit.maxLines}). Extract by authority.`);
  if (current.explicitAny > limit.maxExplicitAny) failures.push(`${path}: explicit any grew to ${current.explicitAny} (cap ${limit.maxExplicitAny}). Add an authority-specific contract.`);
}

const toolBayInspection = inspect(baseline.toolBay.path);
const toolBayCtxPropertyReferences = (toolBayInspection.text.match(/\bctx\.[A-Za-z_$][\w$]*/g) ?? []).length;
const toolBayAsAnyAssertions = (toolBayInspection.text.match(/\bas\s+any\b/g) ?? []).length;
if (toolBayCtxPropertyReferences > baseline.toolBay.maxCtxPropertyReferences) {
  failures.push(`${baseline.toolBay.path}: ctx. references grew to ${toolBayCtxPropertyReferences} (cap ${baseline.toolBay.maxCtxPropertyReferences}). Add a panel-specific typed contract.`);
}
if (toolBayAsAnyAssertions > baseline.toolBay.maxAsAnyAssertions) {
  failures.push(`${baseline.toolBay.path}: as any assertions grew to ${toolBayAsAnyAssertions} (cap ${baseline.toolBay.maxAsAnyAssertions}). Narrow the Tool Bay contract instead.`);
}
for (const [path, limit] of Object.entries(baseline.extractedControllers)) {
  const current = inspect(path);
  if (current.lines > limit.maxLines) failures.push(`${path}: controller grew to ${current.lines} lines (cap ${limit.maxLines}); split by authority rather than recreating a shell.`);
}

const toolBay = toolBayInspection.text;
for (const [pattern, message] of [
  [/from\s+["'][^"']*(?:persistence|hammerWorkspaceHistory)[^"']*["']/, "Tool-bay presentation imported persistence/history ownership."],
  [/\b(?:localStorage|sessionStorage)\b/, "Tool-bay presentation acquired browser-storage ownership."],
  [/evaluateAutomaticPlacementAuthority|resolveCanonicalAutomaticPlacement/, "Tool-bay presentation bypassed the automatic-placement command boundary."],
]) if (pattern.test(toolBay)) failures.push(`src/editor/HammerWorkspaceShellToolBay.tsx: ${message}`);

const shell = inspect("src/editor/HammerWorkspaceShell.tsx").text;
const automaticPlacementAuthority = inspect("src/editor/useHammerWorkspaceShellAutomaticPlacement.ts").text;
if (!automaticPlacementAuthority.includes("resolveHammerAutomaticPlacementCommand")) failures.push("Automatic-placement authority must route every placement through resolveHammerAutomaticPlacementCommand.");
if (shell.includes("resolveHammerAutomaticPlacementCommand")) failures.push("HammerWorkspaceShell reacquired the automatic-placement command boundary.");
if (/applyTranscript(?:DeleteRange|CleanupPreview|ToggleMuteSegments|Split|TrimSegment)Composition/.test(shell)) failures.push("HammerWorkspaceShell reacquired composition history-command construction.");
if (/deriveAudioCutsForSubtractiveTextEdits|commitAudioCutSelection|moveSegmentTiming|trimSegment(?:Start|End)Timing|updateSegmentGain/.test(shell)) failures.push("HammerWorkspaceShell reacquired ordinary transcript-editing mutation construction.");
if (/resolveInsertBrollSuggestionInGraph|updateResolvedInsertBrollOperationInGraph|synchronizeLinkedAudioDuckForBrollOperation|deriveStableHammerVisualAssetId/.test(shell)) failures.push("HammerWorkspaceShell reacquired media-map or manual B-roll mutation construction.");
if (/create(?:HardCut|Crossfade|DipToBlack|FadeAudio|PodcastMasterPass|ApplyLook|ApplyExposure)Instruction/.test(shell)) failures.push("HammerWorkspaceShell reacquired transition, audio-master, or look/exposure mutation construction.");
if (/buildHammer(?:ReleasePrepPackage|RenderAssembly)\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired release-package construction or release projection.");
if (/snapshotAuthorityRef|createHammerWorkspaceShellSnapshotAuthority\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired snapshot-production ref ownership; use the snapshot authority hook contract.");
if (/history(?:Authority|BaselineState)Ref|baselineDerivedLayersRef|derivedLayerHistoryRef/.test(shell)) failures.push("HammerWorkspaceShell reacquired history baseline or derived-layer ref ownership.");
if (/function\s+(?:jumpToHistoryEntry|restoreCurrentHistoryState|selectViewingLayer)\b|setHammerDerivedTextLayerActive/.test(shell)) failures.push("HammerWorkspaceShell reacquired history navigation or viewing-layer mutation construction.");
if (/hammerVisualTimelineReducer|RELABEL_CLIP_ANCHOR/.test(shell)) failures.push("HammerWorkspaceShell reacquired canonical visual selection or anchor mutation construction.");
if (/kind:\s*["']output_selection["']|Clear invalid export output selection|Set export output to Raw transcript/.test(shell)) failures.push("HammerWorkspaceShell reacquired export-output history mutation construction.");
if (/canonicalStructuredTranscriptForPersistence|preserveTranscriptMetadata\s*\(/.test(shell) || !/useHammerPersistedTranscriptProjection\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired canonical persisted-transcript projection; use the snapshot-emitter projection contract.");
if (/loadHammerWorkspaceWorkpieceLabel/.test(shell) || !/useHammerWorkspaceShellWorkpieceLabelHydration\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired workpiece-label artifact loading; use the hydration authority.");
const hydrationAuthority = inspect("src/editor/useHammerWorkspaceShellHydration.ts").text;
if (!/loadLabel\(workspaceId, workpieceId\)/.test(hydrationAuthority) || /\b(?:saveHammer|upload|onWorkspaceSnapshotChange|writeFile)\s*\(/.test(hydrationAuthority)) failures.push("Hydration authority lost workpiece-label loading or acquired artifact-write/persistence ownership.");
if (/\b(?:workpieceLabelLoadingRef|workpieceLabelCancellationRef|workpieceLabelActiveRef)\b/.test(shell)) failures.push("HammerWorkspaceShell acquired raw workpiece-label loading or cancellation refs.");
if (/buildHammerMediaPrepOutputsPackage\s*\(/.test(shell) || !/useHammerWorkspaceShellMediaPrepPackage\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired media-prep package construction; use the media-prep package authority.");
const mediaPrepPackageAuthority = inspect("src/editor/hammerWorkspaceShellMediaPrepPackage.ts").text;
if (/\b(?:useState|useEffect|useLayoutEffect|useRef|fetch|saveHammer|upload|resolveHammerAutomaticPlacementCommand|applyHistoryMutation|buildHammerWorkspaceShellReleasePackage)\s*\(/.test(mediaPrepPackageAuthority)) failures.push("Media-prep package authority acquired I/O, lifecycle, mutation, placement, or release ownership.");
const outputSelectionAuthority = inspect("src/editor/hammerWorkspaceShellOutputSelectionCommands.ts").text;
if (/\b(?:saveHammer|upload|onWorkspaceSnapshotChange|buildHammer(?:Release|WorkspaceShellReleasePackage)|renderBuilt(?:Srt|Vtt))\s*\(/.test(outputSelectionAuthority)) failures.push("Output-selection authority acquired artifact I/O, persistence, caption rendering, or release construction.");
if (/setEditableVisualTimeline|applyVisualTimelineAction/.test(automaticPlacementAuthority)) failures.push("Automatic-placement authority bypassed the canonical placement commit callback.");

const releasePackageAuthority = inspect("src/editor/hammerWorkspaceShellReleasePackage.ts").text;
if (/buildHammerWorkspaceShellReleasePackage\s*\(/.test(shell) || /const\s+exportBasis\s*=\s*useMemo/.test(shell) || !/useHammerWorkspaceShellReleaseBasis\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired release-basis projection or low-level package construction.");
if (/\b(?:transcriptPreparedAt|canonicalGraphUpdatedAt|editorLastOpenedAt)\b/.test(shell)) failures.push("HammerWorkspaceShell reacquired release-specific timestamp projection.");
for (const [pattern, message] of [
  [/\buse(?:State|Effect|Memo|Ref|Callback)\s*\(/, "Release-package construction acquired React hook ownership."],
  [/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage)\b/, "Release-package construction acquired artifact I/O or persistence ownership."],
  [/onWorkspaceSnapshotChange|setEditable[A-Z]|dispatch\s*\(/, "Release-package construction acquired canonical mutation ownership."],
]) if (pattern.test(releasePackageAuthority)) failures.push(`src/editor/hammerWorkspaceShellReleasePackage.ts: ${message}`);

for (const legacyComposer of [
  "composeHammerTimelineDockViewModel", "composeHammerSourceBayViewModel", "composeHammerPreviewBayViewModel",
  "composeHammerToolbarViewModel", "composeHammerToolBayViewModel",
]) if (shell.includes(legacyComposer)) failures.push(`HammerWorkspaceShell bypassed the single view-model composition authority via ${legacyComposer}.`);
if ((shell.match(/createHammerWorkspaceShellViewModelComposition\s*\(\)/g) ?? []).length !== 1) failures.push("HammerWorkspaceShell must install exactly one coordinated five-view-model composition authority.");
if (/\b(?:compareHammerPreparedReleasePackageToCurrent|evaluateHammerReadinessGate|deriveHammerReleaseHandoffPosture|resolvePodcastMasterUiStatus)\s*\(/.test(shell)) failures.push("HammerWorkspaceShell reacquired release comparison, readiness, handoff, or podcast-master status projection.");
if (!/useHammerWorkspaceShellReleaseComparison\s*\(/.test(shell) || !/useHammerWorkspaceShellReleaseReadiness\s*\(/.test(shell)) failures.push("HammerWorkspaceShell must use the coordinated release-prep status authority.");
if (/setEditableVisualTimeline\s*\(/.test(shell)) failures.push("HammerWorkspaceShell bypassed the canonical visual-selection command with a direct timeline setter call.");
const releaseStatusAuthority = inspect("src/editor/hammerWorkspaceShellReleaseStatus.ts").text;
if (/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage|setEditable[A-Z]|createPortal)\b/.test(releaseStatusAuthority)) failures.push("Release-status authority acquired persistence, canonical mutation, or JSX ownership.");
const visualSelectionCommand = inspect("src/editor/hammerWorkspaceVisualSelectionCommand.ts").text;
if (!/selectWorkspaceVisualTimelineClip\s*\(/.test(visualSelectionCommand) || /hammerVisualTimelineReducer|\b(?:saveHammer|fetch|localStorage)\b/.test(visualSelectionCommand)) failures.push("Visual-selection command bypassed the workspace mutation gateway or acquired persistence ownership.");
const selectedVisualContextProjection = inspect("src/editor/hammerSelectedVisualContext.ts").text;
for (const [pattern, message] of [
  [/\buse(?:State|Effect|Memo|Ref|Callback)\s*\(/, "Selected-visual context projection acquired React lifecycle ownership."],
  [/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage|onWorkspaceSnapshotChange)\b/, "Selected-visual context projection acquired I/O or persistence ownership."],
  [/\b(?:dispatch|setSelected|applyHistoryMutation|hammerVisualTimelineReducer)\s*\(/, "Selected-visual context projection acquired selection, reducer, or history command ownership."],
]) if (pattern.test(selectedVisualContextProjection)) failures.push(`src/editor/hammerSelectedVisualContext.ts: ${message}`);
if (!/deriveAssetKind\s*\(/.test(selectedVisualContextProjection)) failures.push("Selected-visual context projection must reuse the frozen asset classification helper.");
const toolBayRouteResolver = inspect("src/editor/hammerToolBayRouteDecision.ts").text;
const routeImports = [...toolBayRouteResolver.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
const allowedRouteImports = new Set([
  "../persistence/hammerPersistenceContract", "./hammerSelectedVisualContext",
  "./hammerWorkspaceShellCore", "./hammerWorkspaceTimeline",
]);
for (const routeImport of routeImports) if (!allowedRouteImports.has(routeImport)) failures.push(`src/editor/hammerToolBayRouteDecision.ts: route resolver acquired non-permitted import ${routeImport}.`);
for (const [pattern, message] of [
  [/\buse(?:State|Effect|Memo|Ref|Callback)\s*\(/, "Route resolver acquired React lifecycle ownership."],
  [/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage|onWorkspaceSnapshotChange)\b/, "Route resolver acquired I/O or persistence ownership."],
  [/\b(?:dispatch|setSelected|setCurrentPass|setEditorMode|applyHistoryMutation|hammerVisualTimelineReducer)\s*\(/, "Route resolver acquired selection, navigation, reducer, or history command ownership."],
]) if (pattern.test(toolBayRouteResolver)) failures.push(`src/editor/hammerToolBayRouteDecision.ts: ${message}`);
const toolBayRouteApplication = inspect("src/editor/hammerToolBayRouteApplication.ts").text;
for (const [pattern, message] of [
  [/\buse(?:State|Effect|Memo|Ref|Callback)\s*\(/, "Route application acquired React lifecycle ownership."],
  [/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage|onWorkspaceSnapshotChange)\b/, "Route application acquired I/O or persistence ownership."],
  [/\b(?:dispatch|setSelected|applyHistoryMutation|hammerVisualTimelineReducer)\s*\(/, "Route application acquired selection, reducer, or history command ownership."],
  [/resolveHammerToolBayRoute\s*\(/, "Route application began reinterpreting the canonical resolver."],
]) if (pattern.test(toolBayRouteApplication)) failures.push(`src/editor/hammerToolBayRouteApplication.ts: ${message}`);

const expansionGate = inspect("src/composition/hammerExpansionGateV1.ts").text;
for (const required of [
  "HAMMER_PERFORMANCE_BUDGETS_V1",
  "createHammerAiProposalV1",
  "acceptHammerAiProposalV1",
  "hammer_ai_proposal_stale",
  "HAMMER_PERMANENT_EXPANSION_RULES_V1",
  "no_browser_acknowledgement",
]) {
  if (!expansionGate.includes(required)) failures.push(`src/composition/hammerExpansionGateV1.ts: permanent expansion gate lost ${required}.`);
}
if (/\b(?:localStorage|sessionStorage)\b/.test(expansionGate)) failures.push("src/composition/hammerExpansionGateV1.ts: expansion gate must not acquire browser-storage acknowledgement.");

const productionAndTests = [];
for (const directory of [join(root, "src"), join(root, "tests")]) {
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) productionAndTests.push(path);
    }
  };
  visit(directory);
}
for (const path of productionAndTests) {
  const text = readFileSync(path, "utf8");
  if (/@ts-nocheck/.test(text)) failures.push(`${relative(root, path)}: @ts-nocheck is prohibited.`);
  const selectedImagePlacementReferences = (text.match(/\bselectedImagePlacement\b/g) ?? []).length;
  if (selectedImagePlacementReferences === 0) continue;
  const relativePath = relative(root, path).replaceAll("\\", "/");
  const maxReferences = baseline.toolBay.selectedImagePlacementConsumers[relativePath];
  if (typeof maxReferences !== "number") failures.push(`${relativePath}: new selectedImagePlacement consumer is prohibited. Use HammerSelectedVisualContext.`);
  else if (selectedImagePlacementReferences > maxReferences) failures.push(`${relativePath}: selectedImagePlacement references grew to ${selectedImagePlacementReferences} (cap ${maxReferences}). Use HammerSelectedVisualContext for new consumers.`);
}
let directVisualRoutingPredicates = 0;
for (const path of productionAndTests.filter((candidate) => candidate.includes(`${join("src", "editor")}`) && !candidate.endsWith("hammerToolBayRouteDecision.ts"))) {
  const text = readFileSync(path, "utf8");
  directVisualRoutingPredicates += (text.match(/\.kind\s*===\s*["']image["']\s*\?\s*["']images["']\s*:\s*["']broll["']/g) ?? []).length;
  directVisualRoutingPredicates += (text.match(/\.kind\s*===\s*["']image["']\s*\?\s*["']image_placement["']\s*:\s*["']image_animation["']/g) ?? []).length;
}
if (directVisualRoutingPredicates > baseline.toolBay.maxDirectVisualRoutingPredicatesOutsideResolver) failures.push(`Direct image-versus-B-roll routing predicates grew to ${directVisualRoutingPredicates} (cap ${baseline.toolBay.maxDirectVisualRoutingPredicatesOutsideResolver}). Route through resolveHammerToolBayRoute.`);

// Representative self-proof: the presentation ownership detector must catch a forbidden cache owner.
if (!/\b(?:localStorage|sessionStorage)\b/.test("function BadToolBay(){ return localStorage.getItem('truth') }")) {
  failures.push("Architecture ratchet self-test failed to detect representative browser-storage regression.");
}
if (("ctx.one; ctx.two".match(/\bctx\.[A-Za-z_$][\w$]*/g) ?? []).length !== 2) {
  failures.push("Architecture ratchet self-test failed to count Tool Bay ctx. references.");
}
if (("value as any; other as  any".match(/\bas\s+any\b/g) ?? []).length !== 2) {
  failures.push("Architecture ratchet self-test failed to count Tool Bay as any assertions.");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`[hammer:architecture] ${failure}`));
  process.exit(1);
}
console.log(`Hammer architecture ratchet passed: Tool Bay ctx=${toolBayCtxPropertyReferences}/${baseline.toolBay.maxCtxPropertyReferences}, as any=${toolBayAsAnyAssertions}/${baseline.toolBay.maxAsAnyAssertions}; principal concentration, controller size, typing, presentation ownership, placement boundary, permanent expansion gate, and ts-nocheck rules are locked.`);
