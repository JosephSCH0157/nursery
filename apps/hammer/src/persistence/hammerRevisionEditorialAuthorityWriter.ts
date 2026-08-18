import {
  commitHammerEditorialAuthorityTwoPhase,
  type EditorialAuthorityArtifactState,
  type EditorialAuthorityCommitAdapter,
  type EditorialAuthorityCommitState,
  type EditorialAuthorityPointerState,
} from "@forge/tongs";
import type { HammerEditorialAuthorityGraph } from "../../../../packages/contracts/hammer/editorial-authority.contract";
import { tongsFetch } from "../lib/tongsFetch";
import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import type { HammerPersistenceTarget } from "./hammerPersistenceContract";
import type { HammerRecordingRevisionRecord } from "./hammerRecordingRevisionPersistence";

type JsonRecord = Record<string, unknown>;

export type HammerRevisionEditorialAuthorityArtifact = Readonly<{
  schema_version: 1;
  workspace_id: string;
  workpiece_id: string;
  canonical_recording_id: string;
  recording_revision_id: string;
  authority: HammerEditorialAuthorityGraph;
}>;

export interface HammerEditorialAuthorityTransport {
  readRevision(): Promise<HammerRecordingRevisionRecord>;
  readArtifact(path: string): Promise<{ state: EditorialAuthorityArtifactState; bytes: Uint8Array | null }>;
  writeArtifact(path: string, bytes: Uint8Array, expectedUpdatedAt: string | null): Promise<EditorialAuthorityArtifactState>;
  deleteArtifact(path: string, expectedUpdatedAt: string): Promise<void>;
  acknowledgePointer(args: { path: string; fingerprint: string; expected: EditorialAuthorityPointerState }): Promise<HammerRecordingRevisionRecord>;
}

const encoder = new TextEncoder();

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function serializeHammerRevisionEditorialAuthorityArtifact(artifact: HammerRevisionEditorialAuthorityArtifact): Uint8Array {
  return encoder.encode(JSON.stringify(canonicalize(artifact)));
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function readPayload(response: Response): Promise<JsonRecord> {
  const value = await response.json() as unknown;
  if (!isRecord(value)) throw new Error("Tongs returned a malformed editorial-authority response.");
  return value;
}

function responseError(payload: JsonRecord, fallback: string): string {
  const error = isRecord(payload.error) ? payload.error : null;
  return typeof error?.message === "string" ? error.message : fallback;
}

function decodeCanonicalBytes(value: unknown): Uint8Array | null {
  if (!isRecord(value)) return null;
  return serializeHammerRevisionEditorialAuthorityArtifact(value as HammerRevisionEditorialAuthorityArtifact);
}

export function createHammerEditorialAuthorityHttpTransport(args: {
  target: HammerPersistenceTarget;
  revisionId: string;
}): HammerEditorialAuthorityTransport {
  const revisionUrl = `/tongs/workspaces/${encodeURIComponent(args.target.workspaceId)}/workpieces/${encodeURIComponent(args.target.workpieceId)}/hammer/revisions/${encodeURIComponent(args.revisionId)}/editorial-authority`;
  let originalBytes: Uint8Array | null | undefined;
  return {
    async readRevision() {
      const response = await tongsFetch(revisionUrl.replace(/\/editorial-authority$/, ""), { method: "GET" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(responseError(payload, "Failed to read the active recording revision."));
      const data = isRecord(payload.data) ? payload.data : null;
      const revision = data?.revision as HammerRecordingRevisionRecord | undefined;
      if (!revision?.id) throw new Error("Tongs returned a malformed recording revision.");
      return revision;
    },
    async readArtifact(path) {
      const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.target.workpieceId)}/read-file?path=${encodeURIComponent(path)}`, { method: "GET" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(responseError(payload, "Failed to read the editorial-authority artifact."));
      if (payload.exists === false) {
        if (typeof originalBytes === "undefined") originalBytes = null;
        return { state: { hash: null, updatedAt: null }, bytes: null };
      }
      const fileRow = isRecord(payload.file_row) ? payload.file_row : null;
      const bytes = decodeCanonicalBytes(payload.data);
      if (typeof originalBytes === "undefined") originalBytes = bytes;
      return {
        state: {
          hash: typeof fileRow?.hash_value === "string" ? fileRow.hash_value : null,
          updatedAt: typeof fileRow?.updated_at === "string" ? fileRow.updated_at : null,
        },
        bytes,
      };
    },
    async writeArtifact(path, bytes, expectedUpdatedAt) {
      const artifact = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.target.workpieceId)}/commit-file`, {
        method: "POST",
        json: {
          path,
          content_type: "application/json",
          file_type: "hammer_revision_editorial_authority",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          json: artifact,
          expected_previous_updated_at: expectedUpdatedAt,
        },
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(responseError(payload, "Failed to write the editorial-authority artifact."));
      const data = isRecord(payload.data) ? payload.data : null;
      const fileRow = isRecord(data?.file_row) ? data.file_row : null;
      return {
        hash: typeof data?.hash === "string" ? data.hash : null,
        updatedAt: typeof fileRow?.updated_at === "string" ? fileRow.updated_at : null,
      };
    },
    async deleteArtifact(path, expectedUpdatedAt) {
      if (originalBytes) {
        await this.writeArtifact(path, originalBytes, expectedUpdatedAt);
        return;
      }
      const response = await tongsFetch(`${revisionUrl}?path=${encodeURIComponent(path)}&expected_updated_at=${encodeURIComponent(expectedUpdatedAt)}`, { method: "DELETE" });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(responseError(payload, "Failed to compensate the editorial-authority artifact."));
    },
    async acknowledgePointer({ path, fingerprint, expected }) {
      const response = await tongsFetch(revisionUrl, {
        method: "POST",
        json: {
          artifact_path: path,
          artifact_fingerprint: fingerprint,
          expected_revision_updated_at: expected.revisionUpdatedAt,
          expected_authority_revision: expected.authorityRevision,
          expected_authority_path: expected.path,
        },
      });
      const payload = await readPayload(response);
      if (!response.ok) throw new Error(responseError(payload, "Failed to acknowledge the editorial-authority pointer."));
      const data = isRecord(payload.data) ? payload.data : null;
      const revision = data?.revision as HammerRecordingRevisionRecord | undefined;
      if (!revision?.id) throw new Error("Tongs returned a malformed editorial-authority acknowledgement.");
      return revision;
    },
  };
}

export async function persistHammerRevisionEditorialAuthority(args: {
  target: HammerPersistenceTarget;
  canonicalRecordingId: string;
  revision: HammerRecordingRevisionRecord;
  authority: HammerEditorialAuthorityGraph;
  transport?: HammerEditorialAuthorityTransport;
}): Promise<{ revision: HammerRecordingRevisionRecord; disposition: "committed" | "already_committed"; fingerprint: string }> {
  if (args.revision.status !== "active") throw new Error("Editorial authority can only be written to the active recording revision.");
  if (args.revision.workspace_id !== args.target.workspaceId || args.revision.workpiece_id !== args.target.workpieceId || args.revision.canonical_recording_id !== args.canonicalRecordingId) {
    throw new Error("Editorial-authority write identities do not match the active canonical revision.");
  }
  const path = `hammer/revisions/${args.revision.id}/editorial-authority.v1.json`;
  const bytes = serializeHammerRevisionEditorialAuthorityArtifact({
    schema_version: 1,
    workspace_id: args.target.workspaceId,
    workpiece_id: args.target.workpieceId,
    canonical_recording_id: args.canonicalRecordingId,
    recording_revision_id: args.revision.id,
    authority: args.authority,
  });
  const fingerprint = await sha256Hex(bytes);
  const transport = args.transport ?? createHammerEditorialAuthorityHttpTransport({ target: args.target, revisionId: args.revision.id });
  let currentRevision = args.revision;
  const readState = async (): Promise<EditorialAuthorityCommitState> => {
    const [artifact, rereadRevision] = await Promise.all([transport.readArtifact(path), transport.readRevision()]);
    currentRevision = rereadRevision;
    return {
      artifact: artifact.state,
      pointer: {
        path: currentRevision.editorial_authority_path,
        fingerprint: currentRevision.editorial_authority_fingerprint,
        authorityRevision: currentRevision.editorial_authority_revision,
        revisionUpdatedAt: currentRevision.updated_at,
      },
    };
  };
  const original = await readState();
  const adapter: EditorialAuthorityCommitAdapter = {
    read: readState,
    writeArtifact: ({ path: writePath, bytes: writeBytes, expectedUpdatedAt }) => transport.writeArtifact(writePath, writeBytes, expectedUpdatedAt),
    acknowledgePointer: async ({ path: pointerPath, fingerprint: pointerFingerprint, expected }) => {
      currentRevision = await transport.acknowledgePointer({ path: pointerPath, fingerprint: pointerFingerprint, expected });
      return {
        path: currentRevision.editorial_authority_path,
        fingerprint: currentRevision.editorial_authority_fingerprint,
        authorityRevision: currentRevision.editorial_authority_revision,
        revisionUpdatedAt: currentRevision.updated_at,
      };
    },
    compensateArtifact: ({ path: artifactPath, expectedWrittenUpdatedAt }) => transport.deleteArtifact(artifactPath, expectedWrittenUpdatedAt),
  };
  const result = await commitHammerEditorialAuthorityTwoPhase({
    plan: { path, originalArtifact: original.artifact, originalPointer: original.pointer, intendedHash: fingerprint, intendedBytes: bytes },
    adapter,
  });
  return { revision: currentRevision, disposition: result.disposition, fingerprint };
}
