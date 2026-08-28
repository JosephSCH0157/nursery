import {
  advanceHammerPreparation,
  openHammerRecordingSession,
  type HammerPreparationAttemptRecord,
} from "../persistence/hammerRecordingRevisionPersistence";
import type { HammerPersistenceTarget } from "../persistence/hammerPersistenceContract";

export type HammerPreparationAuthorityResult =
  | { ok: true; status: number; data: HammerPreparationAttemptRecord }
  | { ok: false; status: number; error: string; error_code?: string | null };

type HammerPreparationReadyAuthorityDependencies = {
  advanceMarkReady: (attempt: HammerPreparationAttemptRecord) => Promise<HammerPreparationAuthorityResult>;
  refreshAttempt: () => Promise<HammerPreparationAuthorityResult>;
};

function requireReadyAttempt(result: HammerPreparationAuthorityResult): HammerPreparationAuthorityResult {
  if (!result.ok || result.data.state === "ready") return result;
  return {
    ok: false,
    status: 409,
    error: `Tongs kept Hammer preparation in ${result.data.state}; the editor cannot present it as ready.`,
    error_code: "hammer_preparation_not_ready",
  };
}

/**
 * Marks one durable preparation attempt ready without allowing client state to
 * override Tongs CAS authority. A stale write rereads once, converges when
 * another actor already reached ready, or retries once with the current version.
 */
export async function markHammerPreparationReadyWithConvergence(args: {
  attempt: HammerPreparationAttemptRecord;
  dependencies: HammerPreparationReadyAuthorityDependencies;
}): Promise<HammerPreparationAuthorityResult> {
  const first = await args.dependencies.advanceMarkReady(args.attempt);
  if (first.ok) return requireReadyAttempt(first);
  if (first.status !== 409) return first;

  const refreshed = await args.dependencies.refreshAttempt();
  if (!refreshed.ok) return refreshed;
  if (refreshed.data.id !== args.attempt.id) {
    return {
      ok: false,
      status: 409,
      error: "The active Hammer preparation attempt changed while readiness was being confirmed.",
      error_code: "hammer_preparation_attempt_changed",
    };
  }
  if (refreshed.data.state === "ready") return refreshed;

  const retried = await args.dependencies.advanceMarkReady(refreshed.data);
  return requireReadyAttempt(retried);
}

export async function refreshHammerPreparationAuthority(args: {
  target: HammerPersistenceTarget;
  operationKey: string;
}): Promise<HammerPreparationAuthorityResult> {
  const refreshed = await openHammerRecordingSession(args.target, { operation_key: args.operationKey });
  return refreshed.ok
    ? { ok: true, status: refreshed.status, data: refreshed.data.preparation_attempt }
    : refreshed;
}

export async function confirmHammerPreparationReady(args: {
  target: HammerPersistenceTarget;
  operationKey: string;
  attempt: HammerPreparationAttemptRecord | null;
  transcriptArtifactPath: string | null;
}): Promise<HammerPreparationAuthorityResult> {
  if (!args.attempt) return { ok: false, status: 409, error: "Hammer could not confirm the durable preparation attempt.", error_code: "hammer_preparation_missing" };
  return markHammerPreparationReadyWithConvergence({
    attempt: args.attempt,
    dependencies: {
      advanceMarkReady: (attempt) => advanceHammerPreparation({
        target: args.target,
        attempt,
        action: "mark_ready",
        transcriptArtifactPath: args.transcriptArtifactPath,
      }),
      refreshAttempt: () => refreshHammerPreparationAuthority(args),
    },
  });
}

export async function refreshBoundHammerPreparationAuthority(args: {
  target: HammerPersistenceTarget;
  operationKey: string;
  expectedAttemptId: string | null;
}): Promise<HammerPreparationAuthorityResult> {
  const refreshed = await refreshHammerPreparationAuthority(args);
  if (!refreshed.ok || refreshed.data.id === args.expectedAttemptId) return refreshed;
  return { ok: false, status: 409, error: "Transcript job binding changed the active Hammer preparation attempt.", error_code: "hammer_preparation_attempt_changed" };
}
