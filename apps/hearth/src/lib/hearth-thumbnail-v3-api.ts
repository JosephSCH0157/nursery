import {
  EPISODE_PACKAGE_V3_SCHEMA,
  canonicalSerialize,
  hydrateEpisodePackageV3,
  serializeEpisodePackageV3,
  type EpisodePackageV3,
  type ThumbnailBaseVersion,
  type ThumbnailCompositeSnapshot,
  type ThumbnailRenderRecipe,
} from "./episode-package-v3";
import { appendLaunchSnapshot, proveThumbnailMutation, type ThumbnailMutationProof } from "./hearth-thumbnail-v3-authority";
import { resolveForgeUserAccessToken } from "./hearth-chat-api";
import { tongsFetch } from "./tongs-fetch";

type ThumbnailMutationKind = Parameters<typeof proveThumbnailMutation>[0]["kind"];

export type CanonicalEpisodePackageV3 = {
  episodePackage: EpisodePackageV3;
  metadata: Record<string, unknown>;
  metadataUpdatedAt: string | null;
};

export type ThumbnailSaveState = "editing" | "saving" | "saved" | "error";

export type V3MutationResult =
  | ({ ok: true; saveState: "saved" } & CanonicalEpisodePackageV3)
  | { ok: false; saveState: "error"; status: number; error: string; canonical?: CanonicalEpisodePackageV3 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function json(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return null; }
}

function errorMessage(body: unknown, fallback: string): string {
  if (!isRecord(body)) return fallback;
  const error = isRecord(body.error) ? body.error : null;
  return readString(error?.message) ?? readString(body.message) ?? fallback;
}

export async function readCanonicalEpisodePackageV3(workpieceId: string): Promise<CanonicalEpisodePackageV3> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    { method: "GET" },
  );
  const body = await json(response);
  if (!response.ok || !isRecord(body) || body.ok !== true) {
    throw new Error(errorMessage(body, "Unable to read canonical episode package."));
  }
  const metadata = isRecord(body.data) ? body.data : {};
  const fileRow = isRecord(body.file_row) ? body.file_row : null;
  return {
    episodePackage: hydrateEpisodePackageV3(metadata),
    metadata,
    metadataUpdatedAt: readString(fileRow?.updated_at),
  };
}

export async function commitEpisodePackageV3Mutation(args: {
  workpieceId: string;
  expectedMetadataUpdatedAt: string | null;
  nextEpisodePackage: EpisodePackageV3;
  mutation: { kind: ThumbnailMutationKind; entityId: string; revision?: number };
  protectedRelationships?: readonly { versionId: string; conceptRevisionId: string }[];
  eventName: string;
  eventPayload?: Record<string, unknown>;
}): Promise<V3MutationResult> {
  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed elsewhere. Reloaded canonical state was preserved.", canonical: before };
  }
  const nextMetadata = {
    ...before.metadata,
    updated_at: new Date().toISOString(),
    episode: serializeEpisodePackageV3(args.nextEpisodePackage),
  };
  const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`, {
    method: "POST",
    json: {
      path: "metadata.json",
      content_type: "application/json",
      json: nextMetadata,
      expected_previous_updated_at: args.expectedMetadataUpdatedAt,
      written_by: { tool: "hearth", tool_version: "3", lane: "canonical" },
      event_name: args.eventName,
      event_payload: { schema: EPISODE_PACKAGE_V3_SCHEMA, ...args.eventPayload },
      correlation_id: crypto.randomUUID(),
    },
  });
  const body = await json(response);
  if (!response.ok) {
    const canonical = await readCanonicalEpisodePackageV3(args.workpieceId).catch(() => undefined);
    return { ok: false, saveState: "error", status: response.status, error: errorMessage(body, "Thumbnail mutation failed."), ...(canonical ? { canonical } : {}) };
  }
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const proof: ThumbnailMutationProof = proveThumbnailMutation({
    expected: args.nextEpisodePackage,
    canonical: canonical.episodePackage,
    kind: args.mutation.kind,
    entityId: args.mutation.entityId,
    revision: args.mutation.revision,
    protectedRelationships: args.protectedRelationships,
  });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}

export async function requireThumbnailUserToken(): Promise<string> {
  const token = await resolveForgeUserAccessToken();
  if (!token) throw new Error("Sign in required for thumbnail asset operations.");
  return token;
}

export async function readCanonicalThumbnailWorkspaceV3(args: {
  workpieceId: string;
  workspaceId: string;
}): Promise<CanonicalEpisodePackageV3> {
  const token = await requireThumbnailUserToken();
  await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/reconcile`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, operation_id: null },
  });
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const resolved = await Promise.all(canonical.episodePackage.thumbnail.base_versions.map(async (base) => {
    const response = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/${encodeURIComponent(base.asset_id)}`, {
      method: "GET", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    });
    const body = await json(response);
    const asset = isRecord(body) && isRecord(body.data) ? body.data : null;
    const status = readString(asset?.status);
    const hash = readString(asset?.content_hash);
    if (!response.ok || !status || !hash || hash !== base.content_hash) {
      return { ...base, status: "recoverable_error" as const, error_details: { code: "asset_missing_or_hash_mismatch" } };
    }
    return {
      ...base,
      status: status as ThumbnailBaseVersion["status"],
      error_details: status === "failed" ? { code: readString(asset?.failure_code), message: readString(asset?.failure_message) } : null,
    };
  }));
  return {
    ...canonical,
    episodePackage: {
      ...canonical.episodePackage,
      thumbnail: { ...canonical.episodePackage.thumbnail, base_versions: resolved },
    },
  };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + 0x8000)));
  }
  return btoa(binary);
}

export type BaseArtworkInput = {
  sourceType: "forge_ai" | "outside_tool";
  bytes: Uint8Array;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  providerId: string;
  providerRequestId?: string | null;
  operationId: string;
};

export async function commitThumbnailBaseArtwork(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  baseVersion: Omit<ThumbnailBaseVersion, "asset_id" | "asset_path" | "content_hash" | "status" | "error_details">;
  artwork: BaseArtworkInput;
}): Promise<V3MutationResult> {
  const token = await requireThumbnailUserToken();
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === args.baseVersion.render_recipe_id && entry.revision === args.baseVersion.render_recipe_revision,
  );
  if (!recipe || recipe.prompt_review_state !== "reviewed") {
    return { ok: false, saveState: "error", status: 409, error: "Review the canonical prompt pack before rendering base artwork." };
  }
  const stageResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/stage`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId,
      operation_id: args.artwork.operationId,
      asset_kind: "thumbnail_image",
      mime_type: args.artwork.mimeType,
      bytes_base64: bytesToBase64(args.artwork.bytes),
      provider: args.artwork.providerId,
      provider_request_id: args.artwork.providerRequestId ?? null,
      prompt: null,
      metadata: {
        source_type: args.artwork.sourceType,
        concept_revision_id: args.baseVersion.concept_revision_id,
        render_recipe_id: args.baseVersion.render_recipe_id,
        render_recipe_revision: args.baseVersion.render_recipe_revision,
      },
    },
  });
  const stageBody = await json(stageResponse);
  const staged = isRecord(stageBody) && isRecord(stageBody.data) ? stageBody.data : null;
  const assetId = readString(staged?.id);
  const assetPath = readString(staged?.path);
  const contentHash = readString(staged?.content_hash);
  if (!stageResponse.ok || !assetId || !assetPath || !contentHash) {
    return { ok: false, saveState: "error", status: stageResponse.status, error: errorMessage(stageBody, "Unable to stage thumbnail artwork.") };
  }
  const base: ThumbnailBaseVersion = {
    ...args.baseVersion,
    asset_id: assetId,
    asset_path: assetPath,
    content_hash: contentHash,
    source_type: args.artwork.sourceType,
    provider_id: args.artwork.providerId,
    provider_request_id: args.artwork.providerRequestId ?? null,
    mime_type: args.artwork.mimeType,
    status: "pending",
    error_details: null,
  };
  const nextPackage: EpisodePackageV3 = {
    ...args.episodePackage,
    thumbnail: { ...args.episodePackage.thumbnail, base_versions: [...args.episodePackage.thumbnail.base_versions, base] },
  };
  const index = nextPackage.thumbnail.base_versions.length - 1;
  const metadataBefore = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((metadataBefore.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while artwork was staging.", canonical: metadataBefore };
  }
  const nextMetadata = { ...metadataBefore.metadata, updated_at: new Date().toISOString(), episode: nextPackage };
  const pointer = `/episode/thumbnail/base_versions/${index}/asset_id`;
  const referenceResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, asset_id: assetId,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: nextMetadata, reference_pointer: pointer,
    },
  });
  if (!referenceResponse.ok) {
    return { ok: false, saveState: "error", status: referenceResponse.status, error: errorMessage(await json(referenceResponse), "Unable to commit the thumbnail package reference.") };
  }
  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: assetId, target_status: "ready" },
  });
  const readyBody = await json(readyResponse);
  if (!readyResponse.ok) {
    return { ok: false, saveState: "error", status: readyResponse.status, error: errorMessage(readyBody, "Artwork was referenced but could not be marked ready.") };
  }
  const expected: EpisodePackageV3 = {
    ...nextPackage,
    thumbnail: {
      ...nextPackage.thumbnail,
      base_versions: nextPackage.thumbnail.base_versions.map((entry) => entry.id === base.id ? { ...entry, status: "ready" } : entry),
    },
  };
  // Asset readiness is canonical in Tongs; package metadata deliberately retains
  // its staged record. Reconciliation/readback overlays asset state before proof.
  const canonical = await readCanonicalThumbnailWorkspaceV3({ workpieceId: args.workpieceId, workspaceId: args.workspaceId });
  const persisted = canonical.episodePackage.thumbnail.base_versions.find((entry) => entry.id === base.id);
  if (!persisted || persisted.asset_id !== assetId || persisted.content_hash !== contentHash) {
    return { ok: false, saveState: "error", status: 409, error: "Canonical package readback did not recover the staged base artwork.", canonical };
  }
  const proof = proveThumbnailMutation({ expected, canonical: canonical.episodePackage, kind: "base_version", entityId: base.id });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}

export function commitForgeAiBaseArtwork(args: Parameters<typeof commitThumbnailBaseArtwork>[0]) {
  if (args.artwork.sourceType !== "forge_ai") throw new Error("Forge renderer requires forge_ai source authority.");
  return commitThumbnailBaseArtwork(args);
}

export function commitOutsideToolBaseArtwork(args: Parameters<typeof commitThumbnailBaseArtwork>[0]) {
  if (args.artwork.sourceType !== "outside_tool") throw new Error("Outside renderer requires outside_tool source authority.");
  return commitThumbnailBaseArtwork(args);
}

function compositorRecipe(recipe: ThumbnailRenderRecipe): Record<string, unknown> {
  const typography = isRecord(recipe.treatment.typography) ? recipe.treatment.typography : {};
  const placement = isRecord(recipe.treatment.placement) ? recipe.treatment.placement : {};
  const shadow = isRecord(recipe.treatment.shadow) ? recipe.treatment.shadow : {};
  return {
    title_text: recipe.title_text,
    title_revision: recipe.title_revision,
    template_revision: recipe.brand_template_revision ?? 1,
    text_color: readString(typography.color) ?? "#FFFFFF",
    shadow_color: readString(shadow.color) ?? "#000000",
    shadow_opacity: typeof shadow.opacity === "number" ? shadow.opacity : 0.7,
    placement: placement.vertical === "top" || placement.vertical === "center" ? placement.vertical : "bottom",
    max_lines: typeof typography.max_lines === "number" ? typography.max_lines : 3,
    horizontal_padding_percent: typeof placement.horizontal_padding_percent === "number" ? placement.horizontal_padding_percent : 8,
  };
}

async function sha256Canonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSerialize(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function commitThumbnailLaunchComposite(args: {
  workpieceId: string;
  workspaceId: string;
  expectedMetadataUpdatedAt: string | null;
  episodePackage: EpisodePackageV3;
  launchVariantId: string;
  baseVersionId: string;
  operationId: string;
  width: number;
  height: number;
  encoding: { format: "png" | "jpeg" | "webp"; quality: number };
  createdAt: string;
}): Promise<V3MutationResult> {
  const token = await requireThumbnailUserToken();
  const base = args.episodePackage.thumbnail.base_versions.find((entry) => entry.id === args.baseVersionId);
  if (!base || base.status !== "ready") return { ok: false, saveState: "error", status: 409, error: "Launch requires ready base artwork." };
  const recipe = args.episodePackage.thumbnail.render_recipes.find(
    (entry) => entry.id === base.render_recipe_id && entry.revision === base.render_recipe_revision,
  );
  if (!recipe) return { ok: false, saveState: "error", status: 409, error: "Exact launch recipe revision is unavailable." };
  const recipeSnapshot = compositorRecipe(recipe);
  const recipeHash = await sha256Canonical(recipeSnapshot);
  const renderResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/render-composite`, {
    method: "POST",
    headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, operation_id: args.operationId, base_asset_id: base.asset_id,
      recipe_snapshot: recipeSnapshot, recipe_snapshot_hash: recipeHash,
      width: args.width, height: args.height, encoding: args.encoding,
    },
  });
  const renderBody = await json(renderResponse);
  const asset = isRecord(renderBody) && isRecord(renderBody.data) ? renderBody.data : null;
  const assetId = readString(asset?.id);
  const assetPath = readString(asset?.path);
  const contentHash = readString(asset?.content_hash);
  if (!renderResponse.ok || !assetId || !assetPath || !contentHash) {
    return { ok: false, saveState: "error", status: renderResponse.status, error: errorMessage(renderBody, "Unable to render launch composite.") };
  }
  const snapshot: ThumbnailCompositeSnapshot = {
    asset_id: assetId, asset_path: assetPath, content_hash: contentHash,
    composition_engine_version: recipe.composition_engine_version,
    recipe_snapshot: structuredClone(recipe), recipe_snapshot_hash: recipeHash, exported_at: args.createdAt,
  };
  const next = appendLaunchSnapshot({
    episodePackage: args.episodePackage, launchVariantId: args.launchVariantId,
    baseVersionId: base.id, snapshot, createdAt: args.createdAt,
  });
  const launchIndex = next.thumbnail.launch_variant_revisions.length - 1;
  const before = await readCanonicalEpisodePackageV3(args.workpieceId);
  if ((before.metadataUpdatedAt ?? null) !== (args.expectedMetadataUpdatedAt ?? null)) {
    return { ok: false, saveState: "error", status: 409, error: "Thumbnail state changed while the composite was rendering.", canonical: before };
  }
  const pointer = `/episode/thumbnail/launch_variant_revisions/${launchIndex}/snapshot/asset_id`;
  const referenceResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/commit-reference`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: {
      workspace_id: args.workspaceId, asset_id: assetId,
      expected_metadata_updated_at: args.expectedMetadataUpdatedAt,
      metadata_document: { ...before.metadata, updated_at: args.createdAt, episode: next }, reference_pointer: pointer,
    },
  });
  if (!referenceResponse.ok) return { ok: false, saveState: "error", status: referenceResponse.status, error: errorMessage(await json(referenceResponse), "Unable to commit launch snapshot reference.") };
  const readyResponse = await tongsFetch(`/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/thumbnail-assets/transition`, {
    method: "POST", headers: { "x-forge-user-authorization": `Bearer ${token}` },
    json: { workspace_id: args.workspaceId, asset_id: assetId, target_status: "ready" },
  });
  if (!readyResponse.ok) return { ok: false, saveState: "error", status: readyResponse.status, error: errorMessage(await json(readyResponse), "Launch snapshot remains recoverable but is not ready.") };
  const canonical = await readCanonicalEpisodePackageV3(args.workpieceId);
  const latest = next.thumbnail.launch_variant_revisions[launchIndex]!;
  const proof = proveThumbnailMutation({ expected: next, canonical: canonical.episodePackage, kind: "launch_revision", entityId: args.launchVariantId, revision: latest.revision });
  if (!proof.ok) return { ok: false, saveState: "error", status: 409, error: proof.reason, canonical };
  return { ok: true, saveState: "saved", ...canonical };
}
