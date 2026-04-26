/**
 * Transcript regeneration API for Hammer post-ingest.
 *
 * Orchestrates:
 *  1. Calling the existing transcript-prep endpoint with the existing media source.
 *  2. Constructing a new `HammerPersistedStructuredTranscript` for the new version.
 *  3. Updating the version registry and emitting a save-request for persistence.
 *
 * This module does NOT call save directly — it returns a save payload the
 * caller wires through the normal `hammerPersistence.ts` save path, keeping
 * the auth/concurrency logic in one place.
 */

import type { HammerPersistedStructuredTranscript, HammerPersistedTranscriptVersionRegistry, HammerPersistenceSaveRequest, HammerPersistenceTarget } from "../persistence/hammerPersistenceContract";
import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import {
  buildPreparedTranscript,
  resolveHammerPrepSource,
} from "../prep/hammerPrep";
import { requestHammerTranscriptPrep } from "../prep/hammerPrepApi";
import type { HammerTranscriptPrepResponse } from "../prep/hammerPrepApi";
import {
  addVersionToRegistry,
  bootstrapTranscriptVersionRegistry,
  buildRegenTranscriptVersionEntry,
  buildTranscriptVersionArtifactPath,
  countVersionsBySource,
  HAMMER_TRANSCRIPT_VERSIONS_ARTIFACT_PATH,
} from "./hammerTranscriptVersionRegistry";

// ── Public types ─────────────────────────────────────────────────────────────

export type HammerTranscriptRegenStatus =
  | "idle"
  | "requesting"
  | "saving"
  | "done"
  | "failed";

export type HammerTranscriptRegenErrorCode =
  | "no_media_source"
  | "prep_api_error"
  | "no_segments"
  | "save_failed"
  | "unknown";

export interface HammerTranscriptRegenError {
  code: HammerTranscriptRegenErrorCode;
  message: string;
  retryable: boolean;
}

export interface HammerTranscriptRegenResult {
  transcript: HammerPersistedStructuredTranscript;
  transcriptArtifactPath: string;
  updatedRegistry: HammerPersistedTranscriptVersionRegistry;
  prepResponse: HammerTranscriptPrepResponse;
}

export interface HammerTranscriptRegenSavePayload {
  target: HammerPersistenceTarget;
  /** The new transcript, to be written at `transcriptArtifactPath`. */
  transcript: HammerPersistedStructuredTranscript;
  transcriptArtifactPath: string;
  /** Updated registry, to be written at HAMMER_TRANSCRIPT_VERSIONS_ARTIFACT_PATH. */
  registry: HammerPersistedTranscriptVersionRegistry;
  /**
   * Updated editorial-authority graph referencing the new transcript_id.
   * The caller builds this via their normal authority builder; we include the
   * required fields so the caller can construct it.
   */
  newTranscriptId: string;
}

// ── Core regen function ──────────────────────────────────────────────────────

/**
 * Run transcript regeneration from source audio.
 *
 * @returns Either the regen result (to be persisted by the caller) or an error.
 */
export async function runHammerTranscriptRegen(args: {
  target: HammerPersistenceTarget;
  launchContext: HammerLaunchContext;
  currentRegistry: HammerPersistedTranscriptVersionRegistry | null;
  currentTranscriptArtifactPath: string | null;
  currentTranscript: HammerPersistedStructuredTranscript | null;
  onStatusChange?: (status: HammerTranscriptRegenStatus, detail?: string) => void;
}): Promise<
  | { ok: true; result: HammerTranscriptRegenResult }
  | { ok: false; error: HammerTranscriptRegenError }
> {
  const { target, launchContext, currentRegistry, currentTranscript, onStatusChange } = args;

  const prepSource = resolveHammerPrepSource(launchContext);
  if (!prepSource) {
    return {
      ok: false,
      error: {
        code: "no_media_source",
        message: "Hammer could not find a media source for transcript regeneration. The episode may not have a canonical recording attached.",
        retryable: false,
      },
    };
  }

  onStatusChange?.("requesting", "Sending audio to transcription service…");

  const prepResult = await requestHammerTranscriptPrep({
    workspace_id: target.workspaceId,
    workpiece_id: target.workpieceId,
    media_kind: prepSource.mediaRef.kind as Parameters<typeof requestHammerTranscriptPrep>[0]["media_kind"],
    local_root_abs: prepSource.local_root_abs ?? null,
    local_relpath: prepSource.local_relpath,
    canonical_workpiece_path: prepSource.canonical_workpiece_path,
    mime_type: prepSource.mediaRef.kind.startsWith("recording_audio") ? "audio/mpeg" : null,
  });

  if (!prepResult.ok) {
    return {
      ok: false,
      error: {
        code: "prep_api_error",
        message: prepResult.error.message,
        retryable: prepResult.error.retryable,
      },
    };
  }

  // Build structured transcript using the same normalization logic as initial prep.
  let preparedTranscript;
  try {
    preparedTranscript = buildPreparedTranscript(launchContext, prepResult.data);
  } catch {
    return {
      ok: false,
      error: {
        code: "no_segments",
        message: "The transcription service returned an empty transcript. The recording may be too short or contain no speech.",
        retryable: true,
      },
    };
  }

  if (preparedTranscript.turns.length === 0) {
    return {
      ok: false,
      error: {
        code: "no_segments",
        message: "Transcript regeneration produced no speaker turns.",
        retryable: true,
      },
    };
  }

  // Resolve (or bootstrap) the version registry.
  let registry = currentRegistry;
  if (!registry) {
    if (currentTranscript && args.currentTranscriptArtifactPath) {
      // Lazy-bootstrap: wrap the existing transcript as the "Anvil original" version.
      registry = bootstrapTranscriptVersionRegistry({
        existingTranscriptArtifactPath: args.currentTranscriptArtifactPath,
        transcript: currentTranscript,
      });
    } else {
      // No prior transcript at all — start a fresh registry.
      registry = {
        schema_version: 1,
        active_version_id: "__pending__",
        versions: [],
      };
    }
  }

  const existingAiVersionCount = countVersionsBySource(registry, "hammer_ai");
  const { entry, artifactPath } = buildRegenTranscriptVersionEntry({
    transcript: preparedTranscript.structuredTranscript,
    prepResponse: prepResult.data,
    versionIndex: existingAiVersionCount,
  });

  const updatedRegistry = addVersionToRegistry(registry, entry);

  return {
    ok: true,
    result: {
      transcript: preparedTranscript.structuredTranscript,
      transcriptArtifactPath: artifactPath,
      updatedRegistry,
      prepResponse: prepResult.data,
    },
  };
}

/**
 * Build the `HammerPersistenceSaveRequest` fields needed to commit a
 * regeneration result.  The caller merges this into their normal save request,
 * ensuring editorial-authority and other concurrency fields are handled by the
 * existing save infrastructure.
 *
 * The `transcript_versions_artifact_path` column update is handled by the
 * persistence layer reading `transcript_version_registry` from the save
 * request (see `hammerPersistenceContract.ts`).
 */
export function buildRegenSaveFields(result: HammerTranscriptRegenResult): Pick<
  HammerPersistenceSaveRequest,
  "structured_transcript" | "transcript_version_registry"
> {
  return {
    structured_transcript: {
      path: result.transcriptArtifactPath,
      data: result.transcript,
    },
    transcript_version_registry: {
      path: HAMMER_TRANSCRIPT_VERSIONS_ARTIFACT_PATH,
      data: result.updatedRegistry,
    },
  };
}

export { HAMMER_TRANSCRIPT_VERSIONS_ARTIFACT_PATH, buildTranscriptVersionArtifactPath };
