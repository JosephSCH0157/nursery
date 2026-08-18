import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import type { HammerPersistenceSnapshot } from "../persistence/hammerPersistenceContract";
import type {
  HammerCanonicalRecordingRecord,
  HammerRecordingRevisionRecord,
} from "../persistence/hammerRecordingRevisionPersistence";
import type { HammerPrepFailureKind } from "./hammerSessionStabilization";

export type HammerCanonicalOpenHydrationResult = {
  reloadOutcome: "success" | "failure";
  effectiveLaunchContext?: HammerLaunchContext;
  hasCanonicalBasis: boolean;
  reopenPersistenceSource: "persistence" | "launch" | "bootstrap" | "transitional" | "none";
  loadedPersistenceSnapshot: HammerPersistenceSnapshot | null;
  activeCanonicalRecording: HammerCanonicalRecordingRecord | null;
  activeRevision: HammerRecordingRevisionRecord | null;
  prepFailureMessage: string | null;
  prepFailureKind: HammerPrepFailureKind;
  prepFailureCode: string | null;
};

const CANONICAL_OPEN_DEDUPE_WINDOW_MS = 4_000;
const PREP_DUPLICATE_KICK_WINDOW_MS = 2_000;

type OpenLedger = Record<string, {
  startedAt: number;
  promise: Promise<HammerCanonicalOpenHydrationResult>;
}>;

function runtimeRecord(): Record<string, unknown> | null {
  return typeof window === "undefined" ? null : window as unknown as Record<string, unknown>;
}

export function getSharedCanonicalOpenHydrationPromise(args: {
  key: string;
  factory: () => Promise<HammerCanonicalOpenHydrationResult>;
}): Promise<HammerCanonicalOpenHydrationResult> {
  const runtime = runtimeRecord();
  if (!runtime) return args.factory();
  const raw = runtime.__forgeHammerCanonicalOpenLedger__;
  const ledger: OpenLedger = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as OpenLedger
    : {};
  runtime.__forgeHammerCanonicalOpenLedger__ = ledger;
  const existing = ledger[args.key];
  const now = Date.now();
  if (existing && Number.isFinite(existing.startedAt) && now - existing.startedAt < CANONICAL_OPEN_DEDUPE_WINDOW_MS) {
    return existing.promise;
  }
  const promise = args.factory().finally(() => {
    if (ledger[args.key]?.promise !== promise) return;
    window.setTimeout(() => {
      if (ledger[args.key]?.promise === promise) delete ledger[args.key];
    }, CANONICAL_OPEN_DEDUPE_WINDOW_MS);
  });
  ledger[args.key] = { startedAt: now, promise };
  return promise;
}

export function shouldSkipDuplicatePrepKick(runKey: string): boolean {
  const runtime = runtimeRecord();
  if (!runtime) return false;
  const raw = runtime.__forgeHammerPrepKickLedger__;
  const ledger: Record<string, number> = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, number>
    : {};
  runtime.__forgeHammerPrepKickLedger__ = ledger;
  const now = Date.now();
  const last = ledger[runKey];
  ledger[runKey] = now;
  return typeof last === "number" && Number.isFinite(last) && now - last < PREP_DUPLICATE_KICK_WINDOW_MS;
}
