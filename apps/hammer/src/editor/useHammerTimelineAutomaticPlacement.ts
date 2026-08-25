import { useEffect, useMemo, useRef, useState } from "react";
import { resolveCanonicalAutomaticPlacement } from "../features/auto-placement/canonicalPlacementAuthority";
import type { PlacementFrameAnalysisAuthority } from "../features/auto-placement/placementFrameAnalysisAuthority";
import type { PlacementFrameEvidence } from "../features/auto-placement/placementFrameAnalysisAuthority";
import { TimelinePlacementAnalysisQueue, type TimelinePlacementAnalysisEntry, type TimelinePlacementAnalysisWorkItem } from "../features/auto-placement/timelinePlacementAnalysisQueue";
import { applyPreviewOverride, clearPreviewOverride, type PreviewPlacementTransform } from "./hammerAutoPreviewPosition";
import type { HammerVisualAsset, HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import { geometryToTransform } from "./hammerWorkspaceShellVisualUtils";
import { automaticPlacementCanonicalRevision } from "./hammerAutomaticPlacementBatch";

export type HammerTimelinePlacementWorkItem = TimelinePlacementAnalysisWorkItem & Readonly<{
  sourceUrl: string;
  canonicalTransform: PreviewPlacementTransform;
}>;

export type HammerTimelineAutomaticPlacementProgress = Readonly<{
  eligible: number;
  analyzed: number;
  queued: number;
  safeExisting: number;
  resolvedSafe: number;
  review: number;
}>;

function resultTransform(frame: { width: number; height: number }, rect: { x: number; y: number; width: number; height: number }): PreviewPlacementTransform {
  return { leftPct: (rect.x / frame.width) * 100, topPct: (rect.y / frame.height) * 100,
    widthPct: (rect.width / frame.width) * 100, heightPct: (rect.height / frame.height) * 100 };
}

function overlapsSubject(placement: { x: number; y: number; width: number; height: number },
  subjectBounds: ReadonlyArray<{ x: number; y: number; width: number; height: number }>): boolean {
  return subjectBounds.some((subject) => placement.x < subject.x + subject.width && placement.x + placement.width > subject.x
    && placement.y < subject.y + subject.height && placement.y + placement.height > subject.y);
}

function transformsEqual(a: PreviewPlacementTransform | undefined, b: PreviewPlacementTransform | undefined): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.leftPct - b.leftPct) < 0.001 && Math.abs(a.topPct - b.topPct) < 0.001
    && Math.abs(a.widthPct - b.widthPct) < 0.001 && Math.abs(a.heightPct - b.heightPct) < 0.001;
}

export function resolveTimelinePlacementResult(canonical: PreviewPlacementTransform, evidence: PlacementFrameEvidence) {
  const frame = evidence.frameRef;
  const canonicalRect = { x: frame.width * canonical.leftPct / 100, y: frame.height * canonical.topPct / 100,
    width: frame.width * canonical.widthPct / 100, height: frame.height * canonical.heightPct / 100 };
  const resolved = resolveCanonicalAutomaticPlacement({ requestedFrameRef: frame, faceResult: evidence.faceResult,
    matteResult: evidence.matteResult, overlay: { width: canonicalRect.width, height: canonicalRect.height } });
  const subjectBounds = [...resolved.headSafeBounds, ...resolved.speakerMaskBounds];
  if (resolved.decision.kind === "refused") return { status: "needs-review" as const, reason: resolved.decision.detail };
  if (!overlapsSubject(canonicalRect, subjectBounds)) return { status: "safe-existing" as const };
  if (resolved.placement) return { status: "resolved-safe" as const, transform: resultTransform(frame, resolved.placement.rect) };
  return { status: "needs-review" as const, reason: "No safe placement candidate was returned." };
}

export function timelinePlacementEntriesEqual(a: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[], b: readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((entry, index) => {
    const next = b[index];
    return next?.status === entry.status && next?.item.placementId === entry.item.placementId
      && next.item.canonicalRevision === entry.item.canonicalRevision && next.item.mediaRevision === entry.item.mediaRevision
      && next.item.geometryRevision === entry.item.geometryRevision && next.item.compositionPresentationTimeSec === entry.item.compositionPresentationTimeSec
      && next.reason === entry.reason && transformsEqual(next.resolvedTransform, entry.resolvedTransform);
  });
}

export function useHammerTimelineAutomaticPlacement(args: {
  authority: PlacementFrameAnalysisAuthority;
  items: readonly HammerTimelinePlacementWorkItem[];
  paused: boolean;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, PreviewPlacementTransform>>>;
}) {
  const queue = useMemo(() => new TimelinePlacementAnalysisQueue<PreviewPlacementTransform>(), []);
  const [entries, setEntries] = useState<readonly TimelinePlacementAnalysisEntry<PreviewPlacementTransform>[]>([]);
  const activeAbortRef = useRef<AbortController | null>(null);
  const itemsKey = useMemo(() => args.items.map((item) => [item.placementId, item.canonicalRevision,
    item.mediaRevision, item.geometryRevision, item.compositionPresentationTimeSec].join(":" )).join("|"), [args.items]);

  useEffect(() => {
    queue.reconcile(args.items);
    const next = queue.snapshot();
    setEntries((current) => timelinePlacementEntriesEqual(current, next) ? current : next);
  }, [args.items, queue]);

  useEffect(() => {
    if (args.paused) {
      activeAbortRef.current?.abort();
      queue.cancelActive();
      return;
    }
    let cancelled = false;
    const run = async () => {
      while (!cancelled) {
        const item = queue.takeNext();
        if (!item) return;
        const detail = item as HammerTimelinePlacementWorkItem;
        const abort = new AbortController();
        activeAbortRef.current = abort;
        setEntries(queue.snapshot());
        if (import.meta.env.DEV) console.debug(`[hammer][auto-placement][queue:start] ${item.placementId} ${item.compositionPresentationTimeSec.toFixed(3)}`);
        let timeout = 0;
        let timedOut = false;
        try {
          const analysis = args.authority.analyze({ requestId: `${item.placementId}:${item.canonicalRevision}:${item.mediaRevision}`,
            placementId: item.placementId, sourceIdentity: item.sourceIdentity, sourceUrl: detail.sourceUrl,
            compositionPresentationTimeSec: item.compositionPresentationTimeSec, expectedMediaRevision: item.mediaRevision,
            geometricRevision: item.geometryRevision, abortSignal: abort.signal,
            matteOptions: { featherPx: 4, subjectExpansionPx: 6, temporalSmoothing: 0, quality: "medium" } });
          const evidence = await Promise.race([analysis, new Promise<never>((_, reject) => {
            timeout = window.setTimeout(() => { timedOut = true; abort.abort(); reject(new Error("Placement analysis timed out.")); }, 12_000);
          })]);
          if (cancelled || abort.signal.aborted) return;
          const result = resolveTimelinePlacementResult(detail.canonicalTransform, evidence);
        if (result.status === "safe-existing") {
          queue.settle({ item, status: "safe-existing" });
          args.setOverrides((current) => clearPreviewOverride(current, item.placementId));
        } else if (result.status === "resolved-safe") {
          queue.settle({ item, status: "resolved-safe", resolvedTransform: result.transform });
          args.setOverrides((current) => applyPreviewOverride(current, item.placementId, result.transform));
        } else {
          queue.settle({ item, status: "needs-review", reason: result.reason });
        }
        if (import.meta.env.DEV) console.debug(`[hammer][auto-placement][queue:settle] ${item.placementId} ${queue.snapshot().find((entry) => entry.item.placementId === item.placementId)?.status}`);
        } catch (error: unknown) {
          if (abort.signal.aborted && !timedOut) return;
          const reason = error instanceof Error ? error.message : "Placement analysis failed.";
          queue.settle({ item, status: /media|decode|source/i.test(reason) ? "missing-media" : /exact composition-time/i.test(reason) ? "stale-evidence" : "needs-review", reason });
          if (import.meta.env.DEV) console.debug(`[hammer][auto-placement][queue:refused] ${item.placementId} ${reason}`);
        } finally {
          window.clearTimeout(timeout);
        }
        if (cancelled) return;
        activeAbortRef.current = null;
        const next = queue.snapshot();
        setEntries((current) => timelinePlacementEntriesEqual(current, next) ? current : next);
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }
    };
    void run();
    return () => {
      cancelled = true;
      activeAbortRef.current?.abort();
      activeAbortRef.current = null;
      queue.cancelActive();
    };
  }, [args.authority, args.paused, args.setOverrides, itemsKey, queue]);

  useEffect(() => () => { activeAbortRef.current?.abort(); queue.reset(); }, [queue]);

  const progress = useMemo<HammerTimelineAutomaticPlacementProgress>(() => ({
    eligible: entries.length,
    analyzed: entries.filter((entry) => entry.status !== "queued" && entry.status !== "waiting-evidence").length,
    queued: entries.filter((entry) => entry.status === "queued" || entry.status === "waiting-evidence").length,
    safeExisting: entries.filter((entry) => entry.status === "safe-existing").length,
    resolvedSafe: entries.filter((entry) => entry.status === "resolved-safe").length,
    review: entries.filter((entry) => !["queued", "waiting-evidence", "safe-existing", "resolved-safe"].includes(entry.status)).length,
  }), [entries]);
  return { entries, progress };
}

export function useHammerTimelineAutomaticPlacementFromTimeline(args: {
  authority: PlacementFrameAnalysisAuthority;
  timeline: HammerVisualTimelineState | null;
  assetsById: ReadonlyMap<string, HammerVisualAsset>;
  sourceUrl: string | null;
  workpieceId: string | null;
  isPlaybackActive: boolean;
  isScrubbing: boolean;
  setOverrides: React.Dispatch<React.SetStateAction<Record<string, PreviewPlacementTransform>>>;
}) {
  const items = useMemo(() => {
    if (!args.timeline || !args.sourceUrl || !args.workpieceId) return [];
    return args.timeline.clips.flatMap((clip) => {
      const asset = clip.asset_id ? args.assetsById.get(clip.asset_id) : null;
      if (!clip.enabled || clip.placement_status !== "placed" || asset?.kind !== "image") return [];
      const transform = geometryToTransform(clip.geometry);
      const geometryRevision = [transform.leftPct, transform.topPct, transform.widthPct, transform.heightPct].map((value) => value.toFixed(3)).join(":");
      return [{ placementId: clip.clip_id, sessionIdentity: args.workpieceId!, sourceIdentity: `${args.workpieceId}:${args.sourceUrl}`,
        sourceUrl: args.sourceUrl!, compositionPresentationTimeSec: Math.max(0, clip.start_sec),
        canonicalRevision: automaticPlacementCanonicalRevision(args.timeline!, clip),
        mediaRevision: args.sourceUrl!, geometryRevision, canonicalTransform: transform }];
    });
  }, [args.assetsById, args.sourceUrl, args.timeline, args.workpieceId]);
  const [paused, setPaused] = useState(true);
  useEffect(() => {
    if (args.isPlaybackActive || args.isScrubbing) { setPaused(true); return; }
    const timer = window.setTimeout(() => setPaused(false), 300);
    return () => window.clearTimeout(timer);
  }, [args.isPlaybackActive, args.isScrubbing]);
  return useHammerTimelineAutomaticPlacement({ authority: args.authority, items, paused, setOverrides: args.setOverrides });
}
