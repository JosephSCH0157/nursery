import type {
  HammerPersistedAudioPolish,
  HammerPersistedEditorSession,
  HammerPersistedStructuredTranscript,
  HammerPersistedVisualPlacements,
  HammerPersistenceSnapshot,
} from "./hammerPersistenceContract";
import type { HammerVisualTimelineState } from "../visuals/model/hammerVisualTypes";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";

export type HammerRevisionAutosaveArtifacts = {
  editor_session?: { data: HammerPersistedEditorSession };
  revision_transcript?: { data: HammerPersistedStructuredTranscript };
  audio_polish?: { data: HammerPersistedAudioPolish };
  visual_timeline?: { data: HammerVisualTimelineState };
  visual_placements?: { data: HammerPersistedVisualPlacements };
};

export type HammerRevisionAutosaveArtifactKey = keyof HammerRevisionAutosaveArtifacts;

function normalizeJson(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Hammer autosave artifacts require finite JSON numbers.");
    return value;
  }
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (typeof value === "object") {
    const row = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(row).sort().flatMap((key) => (
      typeof row[key] === "undefined" ? [] : [[key, normalizeJson(row[key])]]
    )));
  }
  throw new Error("Hammer autosave artifacts must be canonical JSON values.");
}

export function serializeHammerCanonicalArtifact(value: unknown): string {
  return JSON.stringify(normalizeJson(value));
}

function normalizeEditorSessionForSemanticComparison(value: HammerPersistedEditorSession | null): unknown {
  if (!value) return value;
  return {
    ...value,
    last_opened_at: null,
    selected_segment_id: null,
    selected_overlay_row_id: null,
  };
}

function normalizeTimelineForSemanticComparison(value: HammerVisualTimelineState | null): unknown {
  if (!value) return value;
  return {
    ...value,
    debug_origin: null,
    debug_migration_hash: null,
    selected_clip_id: null,
  };
}

function installedArtifactData(
  snapshot: HammerPersistenceSnapshot,
  key: HammerRevisionAutosaveArtifactKey,
): unknown {
  if (key === "editor_session") return snapshot.editor_session.data;
  if (key === "revision_transcript") return snapshot.structured_transcript.data;
  if (key === "audio_polish") return snapshot.audio_polish.data;
  if (key === "visual_timeline") return snapshot.visual_timeline.data;
  return snapshot.visual_placements.data;
}

function normalizeArtifactForSemanticComparison(
  key: HammerRevisionAutosaveArtifactKey,
  value: unknown,
): unknown {
  if (key === "editor_session") return normalizeEditorSessionForSemanticComparison(value as HammerPersistedEditorSession | null);
  if (key === "visual_timeline") return normalizeTimelineForSemanticComparison(value as HammerVisualTimelineState | null);
  return value;
}

export function selectChangedHammerRevisionArtifacts(args: {
  request: HammerRevisionAutosaveArtifacts;
  installed: HammerPersistenceSnapshot;
}): HammerRevisionAutosaveArtifacts {
  const changed: HammerRevisionAutosaveArtifacts = {};
  for (const key of Object.keys(args.request) as HammerRevisionAutosaveArtifactKey[]) {
    const requested = args.request[key];
    if (!requested) continue;
    const requestedSemantic = normalizeArtifactForSemanticComparison(key, requested.data);
    const installedSemantic = normalizeArtifactForSemanticComparison(key, installedArtifactData(args.installed, key));
    if (serializeHammerCanonicalArtifact(requestedSemantic) === serializeHammerCanonicalArtifact(installedSemantic)) continue;
    Object.assign(changed, { [key]: requested });
  }
  return changed;
}

export function areHammerAuthorityGraphsSemanticallyEqual(
  left: HammerEditorialAuthorityGraph | null,
  right: HammerEditorialAuthorityGraph | null,
): boolean {
  const withoutProjectionTimestamp = (value: HammerEditorialAuthorityGraph | null): unknown => (
    value ? { ...value, updated_at: null } : value
  );
  return serializeHammerCanonicalArtifact(withoutProjectionTimestamp(left))
    === serializeHammerCanonicalArtifact(withoutProjectionTimestamp(right));
}

export type HammerSingleFlightCoordinator<T> = {
  enqueue(value: T): void;
  isRunning(): boolean;
  pending(): T | null;
  whenIdle(): Promise<void>;
};

export function createHammerSingleFlightCoordinator<T>(args: {
  run: (value: T) => Promise<void>;
}): HammerSingleFlightCoordinator<T> {
  let running = false;
  let pending: T | null = null;
  let idleWaiters: Array<() => void> = [];

  const resolveIdle = () => {
    if (running || pending !== null) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    for (const resolve of waiters) resolve();
  };
  const drain = async () => {
    if (running) return;
    running = true;
    try {
      while (pending !== null) {
        const next = pending;
        pending = null;
        await args.run(next);
      }
    } finally {
      running = false;
      if (pending !== null) void drain();
      else resolveIdle();
    }
  };
  return {
    enqueue(value) {
      pending = value;
      void drain();
    },
    isRunning: () => running,
    pending: () => pending,
    whenIdle: () => running || pending !== null
      ? new Promise<void>((resolve) => idleWaiters.push(resolve))
      : Promise.resolve(),
  };
}
