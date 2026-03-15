import {
  buildHammerReleasePrepPackageFromSnapshot,
  type HammerReleasePrepPackage,
} from "../../../hammer/src/lib/hammerReleasePrepPackage";
import type { ReleasePacketStub } from "../../../quench/src/core/release-packet.stub.types";
import type { HammerMediaBackboneRuntimeSummary } from "../../../hammer/src/media/hammerMediaBackbone";
import {
  loadHammerPersistenceSnapshot,
} from "../../../hammer/src/persistence/hammerPersistence";
import type {
  HammerPersistenceSnapshot,
  HammerPersistenceTarget,
} from "../../../hammer/src/persistence/hammerPersistenceContract";
import {
  buildSourceArtifactsFromSnapshot,
  buildTongsReleaseHandoffAuthority,
  mapAuthorityToReleaseAssemblySummaryStatus,
  type TongsReleaseHandoffAuthority,
  type TongsReleaseHandoffAuthorityCheck,
  type TongsReleaseHandoffAuthorityObservedStatus,
} from "./tongsReleaseHandoffAuthority";
import {
  buildTongsReleaseRecoveryOrchestration,
  type TongsReleaseRecoveryOrchestration,
} from "./tongsReleaseRecoveryOrchestration";
import { buildTongsQuenchReleasePacketStub } from "./tongsQuenchReleasePacketStub";

export type TongsReleaseAssemblySummaryStatus = "ready" | "attention" | "blocked";

export interface TongsHammerReleaseAssembly {
  schema_version: 1;
  target: {
    workspace_id: string;
    workpiece_id: string;
  };
  source_artifacts: {
    state_updated_at: string | null;
    editor_session: {
      path: string | null;
      updated_at: string | null;
    };
    structured_transcript: {
      path: string | null;
      updated_at: string | null;
    };
    visual_placements: {
      path: string | null;
      updated_at: string | null;
    };
    audio_polish: {
      path: string | null;
      updated_at: string | null;
    };
  };
  release_prep: HammerReleasePrepPackage;
  authority: TongsReleaseHandoffAuthority;
  recovery: TongsReleaseRecoveryOrchestration;
  quench_packet_stub: ReleasePacketStub;
  summary: {
    status: TongsReleaseAssemblySummaryStatus;
    ready_count: number;
    attention_count: number;
    blocking_states: TongsReleaseHandoffAuthorityObservedStatus[];
    message: string;
    checks: TongsReleaseHandoffAuthorityCheck[];
  };
}

export type LoadTongsHammerReleaseAssemblyResult =
  | {
    ok: true;
    status: number;
    snapshot: HammerPersistenceSnapshot;
    assembly: TongsHammerReleaseAssembly;
  }
  | {
    ok: false;
    status: number;
    error: string;
  };

export function buildTongsHammerReleaseAssembly(
  target: HammerPersistenceTarget,
  snapshot: HammerPersistenceSnapshot,
  options?: {
    mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null;
  },
): TongsHammerReleaseAssembly {
  const releasePrep = buildHammerReleasePrepPackageFromSnapshot(snapshot, {
    mediaBackboneRuntime: options?.mediaBackboneRuntime ?? null,
  });
  const sourceArtifacts = buildSourceArtifactsFromSnapshot(snapshot);
  const authority = buildTongsReleaseHandoffAuthority({
    target,
    snapshot,
    sourceArtifacts,
    releasePrep,
  });
  const recovery = buildTongsReleaseRecoveryOrchestration({
    authority,
    releasePrep,
  });
  const blockingStates = [
    ...authority.blockers.map((issue) => issue.observed_status),
    ...authority.warnings.map((issue) => issue.observed_status),
  ].filter((state, index, values) => values.indexOf(state) === index);

  const assemblyBase = {
    schema_version: 1 as const,
    target: {
      workspace_id: target.workspaceId,
      workpiece_id: target.workpieceId,
    },
    source_artifacts: sourceArtifacts,
    release_prep: releasePrep,
    authority,
    recovery,
    summary: {
      status: mapAuthorityToReleaseAssemblySummaryStatus(authority),
      ready_count: authority.checks.filter((check) => check.status === "ready").length,
      attention_count: authority.checks.filter((check) => check.status !== "ready").length,
      blocking_states: blockingStates,
      message: authority.message,
      checks: authority.checks,
    },
  };

  return {
    ...assemblyBase,
    quench_packet_stub: buildTongsQuenchReleasePacketStub(assemblyBase),
  };
}

export async function loadTongsHammerReleaseAssembly(
  target: HammerPersistenceTarget,
  options?: {
    mediaBackboneRuntime?: HammerMediaBackboneRuntimeSummary | null;
  },
): Promise<LoadTongsHammerReleaseAssemblyResult> {
  const snapshotResult = await loadHammerPersistenceSnapshot(target);
  if (!snapshotResult.ok) {
    return snapshotResult;
  }

  return {
    ok: true,
    status: snapshotResult.status,
    snapshot: snapshotResult.data,
    assembly: buildTongsHammerReleaseAssembly(target, snapshotResult.data, options),
  };
}
