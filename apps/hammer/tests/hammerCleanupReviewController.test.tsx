import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHammerWorkspaceShellCleanupCandidateReview } from "../src/editor/useHammerWorkspaceShellCleanupCandidateReview";
import {
  canonicalCleanupSegments,
  cleanupCandidateDescriptor,
  cleanupFingerprint,
  CLEANUP_GENERATOR_VERSION,
  CLEANUP_REVIEW_VERSION,
  type CleanupBasis,
} from "../../../packages/tongs/src/hammer-cleanup-review-contract";
import { generateCanonicalCleanupCandidates } from "../../nursery/server/tongs/hammer-cleanup-review-generator";
import { createDefaultHammerStudioRackState } from "../src/editor/hammerStudioRack";
import type {
  HammerEditorStateSerializable,
  HammerHistoryEntry,
} from "../src/editor/hammerWorkspaceHistory";
import type { HammerMutationPersistenceResult } from "../src/editor/hammerMutationPersistenceReceipt";

test("mounted cleanup controller: pending, retry, acknowledged reopen, stale context, and history-owned approval", async () => {
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost" });
  const previous = {
    window: globalThis.window,
    document: globalThis.document,
    navigator: globalThis.navigator,
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
  };
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    localStorage: dom.window.localStorage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  dom.window.localStorage.setItem("forge-auth", "isolated-token");
  let context = {
    workspace_id: "workspace",
    workpiece_id: "workpiece",
    canonical_recording_id: "recording",
    recording_revision_id: "revision",
  };
  let state: HammerEditorStateSerializable = {
    transcriptSegments: [
      {
        segment_id: "a",
        text: "Um, this is useful.",
        speaker: "A",
        start_sec: 0,
        end_sec: 3,
      },
      {
        segment_id: "b",
        text: "Uh, another useful thought.",
        speaker: "A",
        start_sec: 4,
        end_sec: 7,
      },
    ],
    visualPlacements: null,
    visualTimeline: null,
    audioEdit: null,
    studioRack: createDefaultHammerStudioRackState(),
    editorialAuthorityGraph: null,
    outputSelection: { layerId: null, sourceRecipeRef: null },
    selectedSegmentId: null,
    playheadSec: 0,
    transcriptTimingHint: null,
  };
  let canonical = structuredClone(state.transcriptSegments),
    failures = 0,
    hold: (() => void) | null = null,
    deferDiscard = false;
  const records: Record<string, unknown>[] = [],
    writes: string[] = [];
  let approveResolve: ((r: HammerMutationPersistenceResult) => void) | null =
      null,
    appliedCount = 0;
  const filler = {
    aggressiveness: "medium" as const,
    protectIntentionalPhrasing: true,
  };
  const retake = {
    detection: "normal" as const,
    preferLaterCleanerTake: true,
    honorExplicitRetakePhrases: true,
    sameSpeakerOnly: true,
  };
  globalThis.fetch = async (input, init) => {
    const body = JSON.parse(String(init?.body));
    const path = String(input),
      revision = path.split("/revisions/")[1]!.split("/")[0]!;
    const requestContext = { ...context, recording_revision_id: revision };
    const basis: CleanupBasis = {
      ...requestContext,
      contract_version: CLEANUP_REVIEW_VERSION,
      generator_version: CLEANUP_GENERATOR_VERSION,
      kind: body.kind,
      options: body.options,
      transcript_id: "transcript",
      segments: canonicalCleanupSegments(canonical),
      media: { media_id: "media", sha256: "a".repeat(64), bytes: 100 },
    };
    const fingerprint = await cleanupFingerprint(basis);
    let data: unknown;
    if (path.endsWith("/read")) {
      const cards = generateCanonicalCleanupCandidates(
        body.kind,
        basis.segments,
        body.options,
      );
      data = {
        basis,
        basis_fingerprint: fingerprint,
        acknowledged: records
          .filter((r) => r.basis_fingerprint === fingerprint)
          .map((r) => r.candidate_fingerprint),
        candidates: await Promise.all(
          cards.map(async (c) => ({
            candidate_fingerprint: await cleanupFingerprint(
              cleanupCandidateDescriptor(c, basis.segments),
            ),
            descriptor: cleanupCandidateDescriptor(c, basis.segments),
          })),
        ),
      };
    } else {
      writes.push(body.candidate_fingerprint);
      if (failures-- > 0) throw Error("offline");
      if (deferDiscard)
        await new Promise<void>((resolve) => {
          hold = resolve;
        });
      let receipt = records.find(
        (r) =>
          r.basis_fingerprint === body.basis_fingerprint &&
          r.candidate_fingerprint === body.candidate_fingerprint,
      );
      if (!receipt) {
        receipt = {
          ...requestContext,
          id: `receipt-${records.length}`,
          contract_version: CLEANUP_REVIEW_VERSION,
          decision: "discard",
          ...body,
        };
        records.push(receipt);
      }
      data = { outcome: "committed", receipt };
    }
    return new Response(JSON.stringify({ ok: true, data }), {
      headers: { "content-type": "application/json" },
    });
  };
  let controller!: ReturnType<
    typeof useHammerWorkspaceShellCleanupCandidateReview
  >;
  function Harness() {
    controller = useHammerWorkspaceShellCleanupCandidateReview({
      reviewContext: context,
      transcriptSegments: state.transcriptSegments,
      getDurationSec: () => 10,
      getWaveformProxy: () => null,
      getFillerOptions: () => filler,
      getRetakeOptions: () => retake,
      getSelectedRemoval: () => null,
      captureState: () => state,
      getCurrentState: () => state,
      clearCleanupPreview: () => {},
      setTranscriptTimingHint: () => {},
      applyHistoryMutation: (args) => {
        appliedCount++;
        state = args.computeAfter(state);
        return {
          id: "edit",
          persistence: new Promise<HammerMutationPersistenceResult>(
            (resolve) => {
              approveResolve = resolve;
            },
          ),
        } as unknown as HammerHistoryEntry;
      },
    });
    return <output>{controller.candidateReceiptByKind.fillers}</output>;
  }
  const root = createRoot(dom.window.document.getElementById("app")!);
  const render = async (key = "same") =>
    act(async () => {
      root.render(<Harness key={key} />);
    });
  const flush = async () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });
  const until = async (check: () => boolean) => {
    for (let i = 0; i < 40 && !check(); i++) await flush();
    assert.ok(check());
  };
  try {
    await render();
    await until(() => controller.fillerCandidateCards.length === 2);
    failures = 1;
    await act(async () => {
      await controller.handleCandidateDecision("fillers", false);
    });
    assert.equal(
      controller.candidateReceiptByKind.fillers,
      "Unsaved review decision — Retry",
    );
    assert.equal(controller.fillerCandidateCards.length, 2);
    deferDiscard = true;
    let pending!: Promise<void>;
    await act(async () => {
      pending = controller.handleCandidateDecision("fillers", false);
    });
    await until(() => hold !== null);
    assert.equal(
      controller.candidateReceiptByKind.fillers,
      "Saving review decision…",
    );
    assert.equal(controller.fillerCandidateCards.length, 2);
    await act(async () => {
      hold!();
      await pending;
    });
    await until(() => controller.fillerCandidateCards.length === 1);
    deferDiscard = false;
    await render("reopen");
    await until(() => controller.fillerCandidateCards.length === 1);
    assert.equal(appliedCount, 0);
    assert.equal(records.length, 1);
    await act(async () => { controller.syncReviewPass("transcript_cleanup"); });
    await until(() => controller.fillerCandidateCards.length === 1);
    assert.equal(records.length, 1);
    deferDiscard = true;
    hold = null;
    await act(async () => {
      pending = controller.handleCandidateDecision("fillers", false);
    });
    await until(() => hold !== null);
    context = { ...context, recording_revision_id: "new-revision" };
    await render("reopen");
    await flush();
    await act(async () => {
      hold!();
      await pending;
    });
    await until(() => controller.fillerCandidateCards.length === 2);
    assert.notEqual(
      controller.candidateReceiptByKind.fillers,
      "Candidate discarded (no transcript or audio change).",
    );
    deferDiscard = false;
    const before = records.length;
    await act(async () => {
      pending = controller.handleCandidateDecision("fillers", true);
    });
    await until(() => approveResolve !== null);
    assert.equal(
      controller.candidateReceiptByKind.fillers,
      "Saving canonical edit…",
    );
    assert.equal(appliedCount, 1);
    canonical = structuredClone(state.transcriptSegments);
    await act(async () => {
      approveResolve!({ state: "acknowledged" });
      await pending;
    });
    await render("after-approval");
    await flush();
    assert.equal(records.length, before);
    assert.equal(appliedCount, 1);
    assert.ok(writes.length >= 3);
    await until(() => controller.fillerCandidateCards.length === 1);
    approveResolve = null;
    await act(async () => { pending = controller.handleCandidateDecision("fillers", true); });
    await until(() => approveResolve !== null);
    await act(async () => { approveResolve!({ state: "failed", error: "isolated save failure" }); await pending; });
    assert.equal(controller.candidateReceiptByKind.fillers, "Unsaved canonical edit — use Retry Save; do not apply again.");
    await act(async () => { await controller.handleCandidateDecision("fillers", true); });
    assert.equal(appliedCount, 2, "failed approval is not applied again; history Retry Save owns recovery");
    assert.equal(records.length, before, "approvals never create discard records");
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});
