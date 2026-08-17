import { useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { HammerPersistedStructuredTranscript } from "../persistence/hammerPersistenceContract";
import { buildHammerCaptionPreviewModel } from "../lib/hammerCaptionPreview";
import {
  buildCaptionBasisFingerprint,
  buildCaptionChunksFromPreview,
  countChangedCaptionBlocks,
  normalizeCaptionPunctuation,
  rebuildCaptionArtifactsFromChunks,
  renderBuiltSrt,
  renderBuiltVtt,
  type HammerCaptionArtifactMode,
  type HammerCaptionBuildState,
  type HammerCaptionBuiltChunk,
  type HammerCaptionEditedState,
  type HammerCaptionFormattingState,
} from "./hammerWorkspaceShellCaptionUtils";

/**
 * The canonical transcript is source truth. Captions are derived, editable
 * presentation artifacts. Caption edits never rewrite transcript truth, and
 * transcript changes affect captions only through the established invalidation
 * and rebuild lifecycle. Coordinated entry points preserve legacy hook slots.
 */
const CAPTION_MIN_BLOCK_DURATION_SEC = 0.05;

export function createHammerCaptionRequestLifecycle(initialIdentity: string) {
  let identity = initialIdentity;
  let requestId = 0;
  return {
    syncIdentity(next: string) { identity = next; },
    begin() { requestId += 1; return Object.freeze({ identity, requestId }); },
    accepts(token: { identity: string; requestId: number }) { return token.identity === identity && token.requestId === requestId; },
  };
}

export function projectHammerCaptionsForRelease(args: {
  transcript: HammerPersistedStructuredTranscript;
  outputLayerId: string | null;
  outputRecipeRef: string | null;
  formatting: HammerCaptionFormattingState;
  selectedFormat: "srt" | "vtt";
  buildState: HammerCaptionBuildState | null;
  editedState: HammerCaptionEditedState | null;
}): HammerPersistedStructuredTranscript {
  const fingerprint = buildCaptionBasisFingerprint({ transcript: args.transcript, outputLayerId: args.outputLayerId, outputRecipeRef: args.outputRecipeRef, formatting: args.formatting });
  const current = args.editedState?.baseFingerprint === fingerprint && args.editedState
    ? { generatedAt: args.editedState.updatedAt, approximateTiming: args.editedState.approximateTiming, entryCount: args.editedState.chunkCount, srt: args.editedState.srt, vtt: args.editedState.vtt }
    : args.buildState?.fingerprint === fingerprint && args.buildState
    ? { generatedAt: args.buildState.builtAt, approximateTiming: args.buildState.approximateTiming, entryCount: args.buildState.chunkCount, srt: args.buildState.srt, vtt: args.buildState.vtt }
    : null;
  if (!current) return args.transcript;
  return { ...args.transcript, subtitle_outputs: { schema_version: 1, last_generated_format: args.selectedFormat, srt: { format: "srt", generated_at: current.generatedAt, source_transcript_id: args.transcript.transcript_id, source_layer_id: args.outputLayerId, source_kind: args.outputLayerId ? "derived" : "raw", source_recipe_ref: args.outputRecipeRef, approximate_timing: current.approximateTiming, entry_count: current.entryCount, content: current.srt }, vtt: { format: "vtt", generated_at: current.generatedAt, source_transcript_id: args.transcript.transcript_id, source_layer_id: args.outputLayerId, source_kind: args.outputLayerId ? "derived" : "raw", source_recipe_ref: args.outputRecipeRef, approximate_timing: current.approximateTiming, entry_count: current.entryCount, content: current.vtt } } };
}

export function useHammerCaptionState() {
  const [captionFormatting, setCaptionFormatting] = useState<HammerCaptionFormattingState>({ style: "sentence", maxCharsPerLine: 42, maxLinesPerCaption: 2, includeSpeakerLabels: false, punctuationMode: "preserve", readingSpeed: "standard" });
  const [selectedCaptionArtifactFormat, setSelectedCaptionArtifactFormat] = useState<"srt" | "vtt">("srt");
  const [captionBuildState, setCaptionBuildState] = useState<HammerCaptionBuildState | null>(null);
  const [captionEditedState, setCaptionEditedState] = useState<HammerCaptionEditedState | null>(null);
  const [activeCaptionArtifactMode, setActiveCaptionArtifactMode] = useState<HammerCaptionArtifactMode>("built");
  const [captionBuildFeedback, setCaptionBuildFeedback] = useState<string | null>(null);
  return { captionFormatting, setCaptionFormatting, selectedCaptionArtifactFormat, setSelectedCaptionArtifactFormat, captionBuildState, setCaptionBuildState, captionEditedState, setCaptionEditedState, activeCaptionArtifactMode, setActiveCaptionArtifactMode, captionBuildFeedback, setCaptionBuildFeedback };
}

export function useHammerCaptionEditorRefs() {
  return useRef(new Map<string, HTMLTextAreaElement>());
}

export function createHammerCaptionCommands(args: {
  transcript: HammerPersistedStructuredTranscript;
  outputLayerId: string | null;
  sourceLabel: string;
  fingerprint: string;
  formatting: HammerCaptionFormattingState;
  buildState: HammerCaptionBuildState | null;
  editorRefs: MutableRefObject<Map<string, HTMLTextAreaElement>>;
  setBuildState: Dispatch<SetStateAction<HammerCaptionBuildState | null>>;
  setEditedState: Dispatch<SetStateAction<HammerCaptionEditedState | null>>;
  setActiveMode: Dispatch<SetStateAction<HammerCaptionArtifactMode>>;
  setFeedback: Dispatch<SetStateAction<string | null>>;
}) {
  const rebuildCaptionArtifacts = (): void => {
    const preview = buildHammerCaptionPreviewModel(args.transcript.segments, args.transcript);
    const chunks = buildCaptionChunksFromPreview({ chunks: preview.chunks, formatting: args.formatting });
    args.setBuildState({ builtAt: new Date().toISOString(), sourceLayerId: args.outputLayerId, sourceLabel: args.sourceLabel, fingerprint: args.fingerprint, chunkCount: chunks.length, segmentCount: preview.segment_count, approximateTiming: chunks.some((chunk) => chunk.approximateTiming), chunks, srt: renderBuiltSrt(chunks), vtt: renderBuiltVtt(chunks) });
    args.setFeedback(`Built ${chunks.length} caption rows from ${args.sourceLabel}.`);
  };
  const enableCaptionEdits = (): void => {
    if (!args.buildState) return;
    const now = new Date().toISOString();
    args.setEditedState({ createdAt: now, updatedAt: now, baseFingerprint: args.fingerprint, sourceLayerId: args.buildState.sourceLayerId, sourceLabel: args.buildState.sourceLabel, chunkCount: args.buildState.chunkCount, segmentCount: args.buildState.segmentCount, approximateTiming: args.buildState.approximateTiming, chunks: args.buildState.chunks.map((chunk) => ({ ...chunk, sourceSegmentIds: [...chunk.sourceSegmentIds] })), srt: args.buildState.srt, vtt: args.buildState.vtt });
    args.setActiveMode("edited");
    args.setFeedback("Created editable caption artifact from the current build.");
  };
  const editChunkText = (chunkId: string, nextText: string): void => args.setEditedState((current) => {
    if (!current) return current;
    const normalized = nextText.replace(/\r\n/g, "\n").trim();
    const chunks = current.chunks.map((chunk) => chunk.id === chunkId ? { ...chunk, text: normalized, lineCount: normalized ? normalized.split("\n").filter(Boolean).length : 0, charCount: normalized.replace(/\n/g, "").length } : chunk);
    return { ...current, updatedAt: new Date().toISOString(), chunks, ...rebuildCaptionArtifactsFromChunks(chunks) };
  });
  const splitChunk = (chunkId: string): void => args.setEditedState((current) => {
    if (!current) return current;
    const index = current.chunks.findIndex((chunk) => chunk.id === chunkId); if (index < 0) return current;
    const chunk = current.chunks[index]; const editor = args.editorRefs.current.get(chunkId);
    const caret = editor ? Math.max(0, Math.min(chunk.text.length, editor.selectionStart ?? 0)) : Math.floor(chunk.text.length / 2);
    const leftRaw = chunk.text.slice(0, caret).trim(); const rightRaw = chunk.text.slice(caret).trim();
    if (!leftRaw || !rightRaw) { args.setFeedback("Split needs text on both sides of the caret."); return current; }
    const duration = Math.max(chunk.endSec - chunk.startSec, CAPTION_MIN_BLOCK_DURATION_SEC * 2);
    const leftWeight = Math.max(leftRaw.replace(/\s+/g, "").length, 1); const rightWeight = Math.max(rightRaw.replace(/\s+/g, "").length, 1);
    let splitSec = chunk.startSec + duration * (leftWeight / (leftWeight + rightWeight));
    splitSec = Math.max(chunk.startSec + CAPTION_MIN_BLOCK_DURATION_SEC, Math.min(chunk.endSec - CAPTION_MIN_BLOCK_DURATION_SEC, splitSec));
    if (!(splitSec > chunk.startSec && splitSec < chunk.endSec)) { args.setFeedback("Split skipped because the block is too short."); return current; }
    const left: HammerCaptionBuiltChunk = { ...chunk, id: `${chunk.id}:a`, text: leftRaw, startSec: chunk.startSec, endSec: splitSec, lineCount: leftRaw.split("\n").filter(Boolean).length, charCount: leftRaw.replace(/\n/g, "").length, approximateTiming: true };
    const right: HammerCaptionBuiltChunk = { ...chunk, id: `${chunk.id}:b`, text: rightRaw, startSec: splitSec, endSec: chunk.endSec, lineCount: rightRaw.split("\n").filter(Boolean).length, charCount: rightRaw.replace(/\n/g, "").length, approximateTiming: true };
    const chunks = [...current.chunks.slice(0, index), left, right, ...current.chunks.slice(index + 1)]; args.setFeedback("Split caption block in edited captions.");
    return { ...current, updatedAt: new Date().toISOString(), chunks, ...rebuildCaptionArtifactsFromChunks(chunks) };
  });
  const mergeChunk = (input: { chunkId: string; direction: "up" | "down" }): void => args.setEditedState((current) => {
    if (!current) return current; const index = current.chunks.findIndex((chunk) => chunk.id === input.chunkId); if (index < 0) return current;
    const neighborIndex = input.direction === "up" ? index - 1 : index + 1; const neighbor = current.chunks[neighborIndex]; if (!neighbor) { args.setFeedback("No adjacent block available to merge."); return current; }
    const primary = current.chunks[index]; const first = input.direction === "up" ? neighbor : primary; const second = input.direction === "up" ? primary : neighbor;
    const text = `${first.text.trim()} ${second.text.trim()}`.replace(/\s+/g, " ").trim();
    const merged: HammerCaptionBuiltChunk = { ...first, id: `${first.id}:${second.id}:m`, text, startSec: first.startSec, endSec: second.endSec, lineCount: text.split("\n").filter(Boolean).length, charCount: text.replace(/\n/g, "").length, sourceSegmentIds: [...new Set([...first.sourceSegmentIds, ...second.sourceSegmentIds])], approximateTiming: true };
    const start = Math.min(index, neighborIndex); const chunks = [...current.chunks.slice(0, start), merged, ...current.chunks.slice(start + 2)]; args.setFeedback(input.direction === "up" ? "Merged caption block with previous." : "Merged caption block with next.");
    return { ...current, updatedAt: new Date().toISOString(), chunks, ...rebuildCaptionArtifactsFromChunks(chunks) };
  });
  const normalizeChunkPunctuation = (chunkId: string): void => args.setEditedState((current) => {
    if (!current) return current; const chunks = current.chunks.map((chunk) => { if (chunk.id !== chunkId) return chunk; const text = normalizeCaptionPunctuation(chunk.text); return { ...chunk, text, lineCount: text.split("\n").filter(Boolean).length, charCount: text.replace(/\n/g, "").length }; }); args.setFeedback("Normalized punctuation for selected caption block."); return { ...current, updatedAt: new Date().toISOString(), chunks, ...rebuildCaptionArtifactsFromChunks(chunks) };
  });
  const toggleChunkSpeakerLabel = (chunkId: string): void => args.setEditedState((current) => {
    if (!current) return current; const chunks = current.chunks.map((chunk) => { if (chunk.id !== chunkId) return chunk; const prefix = `${chunk.speaker}: `; const text = chunk.text.startsWith(prefix) ? chunk.text.slice(prefix.length).trimStart() : `${prefix}${chunk.text}`.trim(); return { ...chunk, text, lineCount: text.split("\n").filter(Boolean).length, charCount: text.replace(/\n/g, "").length }; }); args.setFeedback("Toggled speaker label for selected caption block."); return { ...current, updatedAt: new Date().toISOString(), chunks, ...rebuildCaptionArtifactsFromChunks(chunks) };
  });
  const discardEditedCaptions = (): void => { args.setEditedState(null); args.setActiveMode("built"); args.setFeedback("Discarded edited caption artifact. Built captions remain available."); };
  return { rebuildCaptionArtifacts, enableCaptionEdits, editChunkText, splitChunk, mergeChunk, normalizeChunkPunctuation, toggleChunkSpeakerLabel, discardEditedCaptions };
}

export function useHammerCaptionDerivedState(args: { transcript: HammerPersistedStructuredTranscript; outputLayerId: string | null; outputRecipeRef: string | null; sourceLabel: string; formatting: HammerCaptionFormattingState; selectedFormat: "srt" | "vtt"; buildState: HammerCaptionBuildState | null; editedState: HammerCaptionEditedState | null; requestedMode: HammerCaptionArtifactMode }) {
  const fingerprint = useMemo(() => buildCaptionBasisFingerprint({ transcript: args.transcript, outputLayerId: args.outputLayerId, outputRecipeRef: args.outputRecipeRef, formatting: args.formatting }), [args.formatting, args.outputLayerId, args.outputRecipeRef, args.transcript]);
  const buildFreshness = !args.buildState ? "missing" : args.buildState.fingerprint === fingerprint ? "current" : "stale";
  const editedFreshness = !args.editedState ? "missing" : args.editedState.baseFingerprint === fingerprint ? "current" : "stale";
  const activeMode: HammerCaptionArtifactMode = args.editedState ? args.requestedMode : "built";
  const activeState = activeMode === "edited" ? args.editedState : args.buildState;
  const comparisonBase = useMemo(() => args.buildState && args.editedState && args.buildState.fingerprint === args.editedState.baseFingerprint ? args.buildState : null, [args.buildState, args.editedState]);
  const modifiedBlockCount = useMemo(() => args.editedState && comparisonBase ? countChangedCaptionBlocks(comparisonBase.chunks, args.editedState.chunks) : null, [comparisonBase, args.editedState]);
  const buildStatus = buildFreshness === "missing" ? "Missing caption build" : buildFreshness === "current" ? "Up to date" : "Needs refresh";
  const editedStatus = editedFreshness === "missing" ? "No edits" : editedFreshness === "current" ? "Current" : "Stale";
  const releaseSourceLabel = editedFreshness === "current" ? "Edited captions" : buildFreshness === "current" ? "Built captions" : "No current caption artifact";
  return {
    fingerprint, captionBuildFreshness: buildFreshness, captionEditedFreshness: editedFreshness, hasEditableCaptionArtifact: Boolean(args.editedState), activeCaptionMode: activeMode, activeCaptionState: activeState,
    activeCaptionArtifactText: args.selectedFormat === "srt" ? activeState?.srt ?? "" : activeState?.vtt ?? "", captionArtifactStatusLabel: activeMode === "edited" ? `Edited captions (${editedStatus})` : `Built captions (${buildStatus})`, captionReleaseSourceLabel: releaseSourceLabel,
    captionBuiltSummary: buildFreshness === "current" ? "Up to date" : buildFreshness === "stale" ? "Stale" : "Missing", captionEditedSummary: editedFreshness === "current" ? "Valid" : editedFreshness === "stale" ? "Stale" : "No edits",
    captionBuiltTone: buildFreshness === "current" ? "safe" : buildFreshness === "stale" ? "warn" : "neutral", captionEditedTone: editedFreshness === "current" ? "safe" : editedFreshness === "stale" ? "warn" : "neutral",
    captionEditedModifiedBlockCount: modifiedBlockCount, captionEditedChangeSummary: !args.editedState ? "No edited caption artifact." : modifiedBlockCount == null ? "Manual changes present." : modifiedBlockCount > 0 ? `Manual changes present (${modifiedBlockCount} blocks modified).` : "Edited artifact created. No manual changes yet.",
    captionActiveModeLabel: activeMode === "edited" ? "Editing: Edited captions" : "Viewing: Built captions (read-only)", captionActiveModeSourceLabel: `Source: ${activeState?.sourceLabel ?? args.sourceLabel}`,
    captionRebuildConsequenceLabel: args.editedState ? "Rebuild replaces built captions. Edited captions are preserved." : "Rebuild replaces built captions.", captionDiscardConsequenceLabel: args.editedState ? "Discard edits returns to built captions." : null,
    captionReleasePrepSafetyState: editedFreshness === "current" || buildFreshness === "current" ? "safe" : "blocked",
    captionReleasePrepSafetyLabel: editedFreshness === "current" || buildFreshness === "current" ? "Safe for release prep" : "Not safe for release prep",
    captionReleasePrepSafetyDetail: editedFreshness === "current" ? "Edited captions match the current export basis and will be used for release prep." : buildFreshness === "current" && editedFreshness === "stale" ? "Edited captions do not match the current export basis. Release prep will use built captions until edits are refreshed." : buildFreshness === "current" ? "Built captions match the current export basis and are safe to ship." : editedFreshness === "stale" ? "Edited captions do not match the current export basis. Refresh captions or discard edits to proceed." : "Generate captions from the current export basis to proceed.",
    captionEditedBasisDetail: editedFreshness === "current" ? "Matches export basis" : editedFreshness === "stale" ? "Basis changed" : "No edited artifact", captionReleasePrepSummaryLine: `Using ${releaseSourceLabel} · Built ${buildFreshness === "current" ? "Up to date" : buildFreshness === "stale" ? "Stale" : "Missing"} · Edited ${editedFreshness === "current" ? "Valid" : editedFreshness === "stale" ? "Stale" : "No edits"}`,
  } as const;
}
