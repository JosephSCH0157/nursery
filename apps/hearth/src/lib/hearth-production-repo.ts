import { tongsFetch } from "./tongs-fetch";
import {
  applyProductionArtifactToEpisodePackage,
  buildDefaultMetadataDocument,
  hydrateEpisodePackageV2,
  diagnoseThumbnailConceptParsing,
  parseThumbnailCreativeAuthorityFromText,
} from "./episode-package-v2";
import { canonicalSerialize, validateConceptGenerationSet, type ThumbnailConceptRevision, type ThumbnailConceptSet,
  type ThumbnailCreativeBrief, type ThumbnailCreativeStrategy } from "./episode-package-v3";
import { appendConceptSet } from "./hearth-thumbnail-v3-authority";
import { commitEpisodePackageV3Mutation, readCanonicalEpisodePackageV3 } from "./hearth-thumbnail-v3-api";
import { canonicalFramingEquals } from "./hearth-framing-authority";
import { resolveImageMapScriptAnchorFromText } from "./hearth-image-map-beats";
import { readHearthPrimaryScript } from "./hearth-script-repo";

type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type ProductionArtifactKind = "seo" | "tags" | "thumbnails" | "image_beat_sheet" | "pack";

export type ProductionCommitResult =
  | { ok: true; entityId?: string; disposition?: "created" | "existing" }
  | { ok: false; status?: number; reason: string; stage?: "artifact" | "parse" | "normalize" | "validate" | "commit" | "readback"; errors?: string[] };

export type ProductionArtifactReadResult =
  | { ok: true; payload: unknown }
  | { ok: false; status?: number; reason: "not_found" | "request_failed" | "invalid_response" };

const DEFAULT_LANE = "forge-managed";
const DEFAULT_TOOL_VERSION = "0.0.0";
let correlationSeq = 0;

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeIso(value: unknown, fallbackIso?: string): string {
  const raw = readString(value);
  if (!raw) return fallbackIso ?? new Date().toISOString();
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return fallbackIso ?? new Date().toISOString();
  return new Date(timestamp).toISOString();
}

async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isCommitAck(body: unknown): boolean {
  if (!isRecord(body)) return false;
  if (body.ok === true || body.success === true) return true;
  if (isRecord(body.data) && (body.data.ok === true || body.data.success === true)) return true;
  return false;
}

function readRawTextFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return "";
  return readString(payload.raw_text) ?? "";
}

function readGeneratedAtFromPayload(payload: unknown): string {
  if (!isRecord(payload)) return new Date().toISOString();
  return normalizeIso(payload.generated_at);
}

export function findRecoveredConceptSet(args: {
  sets: readonly ThumbnailConceptSet[];
  sourceResponseHash: string;
  generatedAt: string;
  scriptVersion: number;
}): ThumbnailConceptSet | null {
  return args.sets.find((set) => (
    set.source_response_hash === args.sourceResponseHash
    && set.created_at === args.generatedAt
    && set.approved_script_version === args.scriptVersion
  )) ?? null;
}

function resolveLane(): string {
  if (typeof window !== "undefined") {
    try {
      const query = new URLSearchParams(window.location.search || "");
      const fromQuery = readString(query.get("forge_lane") ?? query.get("lane"));
      if (fromQuery) return fromQuery;
    } catch {
      // ignore query parsing failures
    }
    try {
      const w = window as typeof window & { __forgeLane?: unknown; __tpLane?: unknown };
      const fromWindow = readString(w.__forgeLane ?? w.__tpLane);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore global inspection failures
    }
    try {
      const fromStorage = readString(window.localStorage.getItem("forge_lane_v1"));
      if (fromStorage) return fromStorage;
    } catch {
      // ignore storage failures
    }
  }
  return DEFAULT_LANE;
}

function resolveToolVersion(): string {
  if (typeof window !== "undefined") {
    try {
      const w = window as typeof window & { APP_VERSION?: unknown };
      const fromWindow = readString(w.APP_VERSION);
      if (fromWindow) return fromWindow;
    } catch {
      // ignore global inspection failures
    }
  }
  return DEFAULT_TOOL_VERSION;
}

function buildWrittenBy(): WrittenBy {
  return {
    tool: "hearth",
    tool_version: resolveToolVersion(),
    lane: resolveLane(),
  };
}

function nextCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}:${Date.now().toString(36)}:${correlationSeq}`;
}

function artifactPath(kind: ProductionArtifactKind, scriptVersion: number): string {
  const base = `production/v${scriptVersion}`;
  if (kind === "seo") return `${base}/seo.json`;
  if (kind === "tags") return `${base}/tags.json`;
  if (kind === "thumbnails") return `${base}/thumbnails.json`;
  if (kind === "image_beat_sheet") return `${base}/image-beat-sheet.json`;
  return `${base}/pack.json`;
}

export async function readWorkpieceProductionArtifact(args: {
  workpieceId: string;
  scriptVersion: number;
  kind: ProductionArtifactKind;
}): Promise<ProductionArtifactReadResult> {
  const url = `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(
    artifactPath(args.kind, args.scriptVersion),
  )}&optional=1`;
  const response = await tongsFetch(url, { method: "GET" });
  const body = await readJsonBody(response);

  if (response.ok && isRecord(body) && body.ok === true && body.exists === false) {
    return { ok: false, status: 404, reason: "not_found" };
  }
  if (response.status === 404) {
    return { ok: false, status: response.status, reason: "not_found" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "request_failed" };
  }
  if (!isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    return { ok: false, status: response.status, reason: "invalid_response" };
  }
  return { ok: true, payload: body.data };
}

async function readWorkpieceMetadata(workpieceId: string): Promise<Record<string, unknown> | null> {
  const url = `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`;
  const response = await tongsFetch(url, { method: "GET" });
  const body = await readJsonBody(response);

  if (response.status === 404) {
    const exists = isRecord(body) ? body.exists : null;
    if (exists === false) return null;
    return null;
  }

  if (!response.ok) return null;
  if (!isRecord(body) || body.ok !== true) return null;
  if (!isRecord(body.data)) return null;
  return body.data;
}

async function commitMetadataDocument(args: {
  workpieceId: string;
  metadata: Record<string, unknown>;
  action: ProductionArtifactKind;
  scriptVersion: number;
}): Promise<ProductionCommitResult> {
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: args.metadata,
      written_by: buildWrittenBy(),
      correlation_id: nextCorrelationId("hearth-episode-v2"),
      event_name: "hearth.episode.package.v2",
      event_payload: {
        action: args.action,
        script_version: args.scriptVersion,
      },
    },
  });

  const body = await readJsonBody(response);
  if (!response.ok || !isCommitAck(body)) {
    return {
      ok: false,
      status: response.status,
      reason: "metadata_commit_failed",
    };
  }

  return { ok: true };
}

async function syncEpisodePackageMetadata(args: {
  workpieceId: string;
  workspaceId?: string | null;
  scriptVersion: number;
  kind: ProductionArtifactKind;
  payload: unknown;
}): Promise<ProductionCommitResult> {
  if (args.kind === "thumbnails") {
    const rawText = readRawTextFromPayload(args.payload);
    const parseDiagnostic = diagnoseThumbnailConceptParsing(rawText);
    const parsed = parseDiagnostic.concepts;
    if (parsed.length !== 5) return {
      ok: false, status: 422, reason: `Parsed ${parsed.length} of 5 required thumbnail concepts.`,
      stage: "parse",
      errors: [`Parser branch: ${parseDiagnostic.branch}.`, ...parseDiagnostic.structuralErrors],
    };
    const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
    const createdAt = readGeneratedAtFromPayload(args.payload);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSerialize(rawText)));
    const sourceHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const existingSet = findRecoveredConceptSet({
      sets: canonical.episodePackage.thumbnail.concept_sets,
      sourceResponseHash: sourceHash,
      generatedAt: createdAt,
      scriptVersion: args.scriptVersion,
    });
    if (existingSet) return { ok: true, entityId: existingSet.id, disposition: "existing" };
    const setId = crypto.randomUUID();
    const parsedAuthority = parseThumbnailCreativeAuthorityFromText(rawText);
    const strategyId = crypto.randomUUID();
    const strategy: ThumbnailCreativeStrategy = parsedAuthority ? {
      id: strategyId, revision: 1, approved_script_version: args.scriptVersion,
      episode_promise: parsedAuthority.strategy.episodePromise,
      intended_viewer: parsedAuthority.strategy.intendedViewer,
      curiosity_mechanism: parsedAuthority.strategy.curiosityMechanism,
      editorial_positioning: parsedAuthority.strategy.editorialPositioning,
      expectation_integrity: { truthful_connection: parsedAuthority.strategy.truthfulConnection,
        prohibited_exaggerations: parsedAuthority.strategy.prohibitedExaggerations },
      created_at: createdAt, provenance: { source: "hearth_generation", artifact_path: artifactPath("thumbnails", args.scriptVersion) },
    } : {
      id: strategyId, revision: 1, approved_script_version: args.scriptVersion,
      episode_promise: "Preserve the approved episode promise.", intended_viewer: "The intended episode audience.",
      curiosity_mechanism: "A truthful visual curiosity gap.", editorial_positioning: "Use the paid canonical concept response without unsupported exaggeration.",
      expectation_integrity: { truthful_connection: "Recovered from a legacy five-concept generation artifact.", prohibited_exaggerations: [] },
      created_at: createdAt, provenance: { source: "legacy_generation_recovery", artifact_path: artifactPath("thumbnails", args.scriptVersion) },
    };
    const briefs: ThumbnailCreativeBrief[] = parsed.map((concept, index) => {
      const parsedBrief = parsedAuthority?.briefs[index];
      return {
        id: crypto.randomUUID(), revision: 1, strategy_id: strategy.id, strategy_revision: strategy.revision, concept_slot: index + 1,
        subject_direction: parsedBrief?.subjectDirection ?? concept.label,
        focal_action: parsedBrief?.focalAction ?? concept.prompt_text,
        composition_direction: parsedBrief?.compositionDirection ?? concept.prompt_text,
        emotional_tone: parsedBrief?.emotionalTone ?? concept.style_preset ?? "unspecified",
        visual_hierarchy: parsedBrief?.visualHierarchy ?? "Make the primary subject immediately legible.",
        title_compatibility: parsedBrief?.titleCompatibility ?? "Reserve clean negative space for local canonical typography.",
        expectation_integrity_rationale: parsedBrief?.expectationIntegrityRationale ?? strategy.expectation_integrity.truthful_connection,
        provider_neutral_render_direction: parsedBrief?.providerNeutralRenderDirection ?? concept.prompt_text,
        subject_classification: "unspecified", composition_classification: "unspecified", dominant_colors: [],
        created_at: createdAt, provenance: { source: parsedAuthority ? "hearth_generation" : "legacy_generation_recovery" },
      };
    });
    const concepts: ThumbnailConceptRevision[] = parsed.map((concept, index) => ({
      concept_lineage_id: crypto.randomUUID(), concept_revision_id: crypto.randomUUID(), revision_number: 1,
      supersedes_revision_id: null, concept_set_id: setId, headline: concept.label,
      strategy_id: strategy.id, strategy_revision: strategy.revision,
      creative_brief_id: briefs[index]!.id, creative_brief_revision: briefs[index]!.revision,
      image_concept: concept.prompt_text, mood_style: concept.style_preset ?? "unspecified",
      normalized_prompt_basis: concept.prompt_text.trim().replace(/\s+/g, " "), created_at: createdAt,
      provenance: { source: "hearth_generation", script_version: args.scriptVersion },
    }));
    const validationErrors = validateConceptGenerationSet(concepts.map(({ concept_set_id: _ignored, ...concept }) => concept));
    if (validationErrors.length) {
      return { ok: false, status: 422, reason: validationErrors.join(" "), stage: "validate", errors: validationErrors };
    }
    const withAuthority = { ...canonical.episodePackage, thumbnail: { ...canonical.episodePackage.thumbnail,
      creative_strategies: [...canonical.episodePackage.thumbnail.creative_strategies, strategy],
      active_creative_strategy_id: strategy.id,
      creative_briefs: [...canonical.episodePackage.thumbnail.creative_briefs, ...briefs] } };
    const next = appendConceptSet({ episodePackage: withAuthority, concepts, conceptSet: {
      id: setId, name: `Concept Set ${canonical.episodePackage.thumbnail.concept_sets.length + 1}`,
      created_at: createdAt, state: "active", approved_script_version: args.scriptVersion,
      generation_provenance: { source: "hearth_generation" }, prompt_schema_version: "hearth-thumbnail-concepts-v1",
      source_response_hash: sourceHash, concept_revision_ids: concepts.map((entry) => entry.concept_revision_id),
    } });
    const saved = await commitEpisodePackageV3Mutation({
      workpieceId: args.workpieceId, expectedMetadataUpdatedAt: canonical.metadataUpdatedAt,
      nextEpisodePackage: next, mutation: { kind: "concept_set", entityId: setId },
      eventName: "hearth.thumbnail.concept-set.generated.v3",
      eventPayload: { script_version: args.scriptVersion, concept_set_id: setId },
    });
    if (!saved.ok) return { ok: false, status: saved.status, reason: saved.error, stage: "commit", errors: [saved.error] };
    const verified = await readCanonicalEpisodePackageV3(args.workpieceId);
    const verifiedSet = verified.episodePackage.thumbnail.concept_sets.find((set) => set.id === setId);
    if (!verifiedSet || verifiedSet.source_response_hash !== sourceHash) {
      return { ok: false, status: 409, reason: "Canonical readback did not contain the committed concept set.", stage: "readback" };
    }
    return { ok: true, entityId: setId, disposition: "created" };
  }

  const nowIso = new Date().toISOString();
  const existing = await readWorkpieceMetadata(args.workpieceId);
  const existingWorkspaceId = isRecord(existing) ? readString(existing.workspace_id) : null;
  const existingStatus = isRecord(existing) ? readString(existing.status) : null;
  const existingNotes = isRecord(existing) ? existing.notes ?? null : null;
  const existingOrigin = isRecord(existing) ? existing.origin ?? null : null;
  const existingContentCategory = isRecord(existing) ? readString(existing.content_category) : null;

  const workspaceId = existingWorkspaceId ?? readString(args.workspaceId);
  if (!workspaceId) {
    return { ok: true };
  }
  const metadata = existing ?? buildDefaultMetadataDocument({
    workpieceId: args.workpieceId,
    workspaceId,
    createdAt: nowIso,
    updatedAt: nowIso,
    status: existingStatus ?? "draft",
    notes: existingNotes,
    origin: existingOrigin,
    contentCategory: existingContentCategory,
  });

  const rawText = readRawTextFromPayload(args.payload);
  if (!rawText.trim()) {
    return { ok: true };
  }

  let resolveImageMapScriptAnchor:
    | ((anchorText: string, matchHint?: string | null) => ReturnType<typeof resolveImageMapScriptAnchorFromText>)
    | null
    = null;
  if (args.kind === "image_beat_sheet") {
    const canonicalScript = await readHearthPrimaryScript(args.workpieceId);
    if (canonicalScript.ok && canonicalScript.data.text?.trim()) {
      const scriptText = canonicalScript.data.text;
      resolveImageMapScriptAnchor = (anchorText, matchHint) => (
        resolveImageMapScriptAnchorFromText(scriptText, anchorText, matchHint)
      );
    }
  }

  const nextMetadata = applyProductionArtifactToEpisodePackage({
    metadata,
    action: args.kind,
    rawText,
    generatedAt: readGeneratedAtFromPayload(args.payload),
    resolveImageMapScriptAnchor,
  });

  if (args.kind === "seo" && canonicalFramingEquals(
    hydrateEpisodePackageV2(metadata),
    hydrateEpisodePackageV2(nextMetadata),
  )) return { ok: true, disposition: "existing" };

  const committed = await commitMetadataDocument({
    workpieceId: args.workpieceId,
    metadata: nextMetadata,
    action: args.kind,
    scriptVersion: args.scriptVersion,
  });
  if (!committed.ok || (args.kind !== "seo" && args.kind !== "tags" && args.kind !== "pack")) {
    return committed;
  }

  // Production generation may update the editor only after the same metadata
  // read used on page reload proves the framing survived the durable write.
  const verifiedMetadata = await readWorkpieceMetadata(args.workpieceId);
  if (!verifiedMetadata || !canonicalFramingEquals(
    hydrateEpisodePackageV2(verifiedMetadata),
    hydrateEpisodePackageV2(nextMetadata),
  )) {
    return { ok: false, status: 409, reason: "metadata_verification_failed" };
  }
  return committed;
}

export async function commitWorkpieceProductionArtifact(args: {
  workpieceId: string;
  workspaceId?: string | null;
  scriptVersion: number;
  kind: ProductionArtifactKind;
  payload: unknown;
  syncCanonical?: boolean;
  artifactAlreadyPersisted?: boolean;
}): Promise<ProductionCommitResult> {
  if (!args.artifactAlreadyPersisted) {
    const url = `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`;
    const response = await tongsFetch(url, {
      method: "POST",
      json: {
        path: artifactPath(args.kind, args.scriptVersion),
        content_type: "application/json",
        json: args.payload,
        written_by: buildWrittenBy(),
        correlation_id: nextCorrelationId("hearth-production"),
        event_name: "hearth.production.artifact.v1",
        event_payload: {
          kind: args.kind,
          script_version: args.scriptVersion,
        },
      },
    });

    if (!response.ok) {
      return { ok: false, status: response.status, reason: "request_failed", stage: "artifact" };
    }
    const body = await readJsonBody(response);
    if (!isRecord(body) || body.ok !== true) {
      return { ok: false, status: response.status, reason: "invalid_response", stage: "artifact" };
    }
  }

  if (args.syncCanonical === false) return { ok: true };
  const metadataResult = await syncEpisodePackageMetadata(args);
  if (!metadataResult.ok) {
    return metadataResult;
  }
  return metadataResult;
}
