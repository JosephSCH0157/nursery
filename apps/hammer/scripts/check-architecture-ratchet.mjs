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
for (const [path, limit] of Object.entries(baseline.extractedControllers)) {
  const current = inspect(path);
  if (current.lines > limit.maxLines) failures.push(`${path}: controller grew to ${current.lines} lines (cap ${limit.maxLines}); split by authority rather than recreating a shell.`);
}

const toolBay = inspect("src/editor/HammerWorkspaceShellToolBay.tsx").text;
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
const outputSelectionAuthority = inspect("src/editor/hammerWorkspaceShellOutputSelectionCommands.ts").text;
if (/\b(?:saveHammer|upload|onWorkspaceSnapshotChange|buildHammer(?:Release|WorkspaceShellReleasePackage)|renderBuilt(?:Srt|Vtt))\s*\(/.test(outputSelectionAuthority)) failures.push("Output-selection authority acquired artifact I/O, persistence, caption rendering, or release construction.");
if (/setEditableVisualTimeline|applyVisualTimelineAction/.test(automaticPlacementAuthority)) failures.push("Automatic-placement authority bypassed the canonical placement commit callback.");

const releasePackageAuthority = inspect("src/editor/hammerWorkspaceShellReleasePackage.ts").text;
for (const [pattern, message] of [
  [/\buse(?:State|Effect|Memo|Ref|Callback)\s*\(/, "Release-package construction acquired React hook ownership."],
  [/\b(?:saveHammer|loadHammer|fetch|localStorage|sessionStorage)\b/, "Release-package construction acquired artifact I/O or persistence ownership."],
  [/onWorkspaceSnapshotChange|setEditable[A-Z]|dispatch\s*\(/, "Release-package construction acquired canonical mutation ownership."],
]) if (pattern.test(releasePackageAuthority)) failures.push(`src/editor/hammerWorkspaceShellReleasePackage.ts: ${message}`);

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
}

// Representative self-proof: the presentation ownership detector must catch a forbidden cache owner.
if (!/\b(?:localStorage|sessionStorage)\b/.test("function BadToolBay(){ return localStorage.getItem('truth') }")) {
  failures.push("Architecture ratchet self-test failed to detect representative browser-storage regression.");
}

if (failures.length) {
  failures.forEach((failure) => console.error(`[hammer:architecture] ${failure}`));
  process.exit(1);
}
console.log("Hammer architecture ratchet passed: principal concentration, controller size, typing, presentation ownership, placement boundary, permanent expansion gate, and ts-nocheck rules are locked.");
