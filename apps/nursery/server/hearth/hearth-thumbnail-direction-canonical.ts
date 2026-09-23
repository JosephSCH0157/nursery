import crypto from "node:crypto";
import {
  EPISODE_PACKAGE_V3_SCHEMA,
  canonicalContentHash,
  deterministicUuid,
  hydrateEpisodePackageV3,
  serializeEpisodePackageV3,
} from "../../../hearth/src/lib/episode-package-v3";
import { buildPaidThumbnailDirectionMutation } from "../../../hearth/src/lib/hearth-paid-thumbnail-direction-persistence";
import type { PaidThumbnailDirectionInput } from "./hearth-paid-thumbnail-direction-generation";
import {
  HEARTH_THUMBNAIL_DIRECTION_CONTRACT,
  HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT,
} from "./hearth-paid-thumbnail-direction-generation";
import { serverTongsRequest } from "../tongs/server-tongs-request";

type JsonObject = Record<string, unknown>;

type Gate = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type QueryResult = {
  data: unknown[] | null;
  error: { message: string } | null;
};

type QueryBuilder = {
  select(columns: string): QueryBuilder;
  eq(column: string, value: string): QueryBuilder;
  order(column: string, options: { ascending: boolean }): QueryBuilder;
  limit(count: number): PromiseLike<QueryResult>;
};

type ServiceStore = {
  schema(name: string): {
    from(table: string): QueryBuilder;
  };
};

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function thumbnailDirectionStyleAuthority(input: PaidThumbnailDirectionInput): JsonObject {
  return {
    resolved_source: input.style.resolvedSource,
    authority_revision: input.style.authorityRevision,
    binding_id: input.style.bindingId,
    binding_revision: input.style.bindingRevision,
    profile_revision_id: input.style.profileRevisionId,
    profile_content_hash: input.style.profileContentHash,
    planning_rules: input.style.planningRules,
  };
}

export function thumbnailDirectionTitleInputs(input: PaidThumbnailDirectionInput): JsonObject[] {
  return input.titles.map((title) => ({
    key: title.key,
    id: title.id,
    revision: title.revision,
    text: title.text,
    thumbnail_text: title.thumbnailText,
  }));
}

export function assertRecoverableThumbnailDirectionStaged(args: {
  staged: JsonObject;
  input: PaidThumbnailDirectionInput;
  allowCanonicalReplay?: boolean;
}): void {
  const { staged, input } = args;
  const stagedAuthority = isRecord(staged.thumbnail_authority) ? staged.thumbnail_authority : null;
  const stagedStyle = isRecord(staged.style_authority) ? staged.style_authority : null;
  const stagedTitles = Array.isArray(staged.title_inputs) && staged.title_inputs.every(isRecord)
    ? staged.title_inputs
    : null;
  if (staged.contract !== HEARTH_THUMBNAIL_DIRECTION_CONTRACT
    || staged.output_contract !== HEARTH_THUMBNAIL_DIRECTION_OUTPUT_CONTRACT
    || staged.script_approval_id !== input.approved.approvalId
    || staged.script_approval_revision !== input.approved.approvalRevision
    || staged.script_content_hash !== input.approved.scriptHash
    || !stagedStyle || canonicalContentHash(stagedStyle) !== canonicalContentHash(thumbnailDirectionStyleAuthority(input))
    || !stagedTitles || canonicalContentHash(stagedTitles) !== canonicalContentHash(thumbnailDirectionTitleInputs(input))
    || !stagedAuthority
    || (!args.allowCanonicalReplay && (
      stagedAuthority.authority_version !== input.authority.thumbnailAuthorityVersion
      || stagedAuthority.active_strategy_id !== input.authority.activeStrategyId
      || stagedAuthority.active_concept_set_id !== input.authority.activeConceptSetId
      || stagedAuthority.planning_subtree_hash !== input.authority.planningSubtreeHash
    ))) {
    throw new Error("The retained Thumbnail Directions result no longer matches current canonical authority.");
  }
}

export async function readLatestStagedThumbnailDirectionResult(args: {
  service: unknown;
  userId: string;
  workspaceId: string;
  workpieceId: string;
}): Promise<{
  operationId: string;
  reservationId: string;
  resultId: string;
  staged: JsonObject;
  canonicalReceipt: JsonObject | null;
} | null> {
  const store = (args.service as ServiceStore).schema("tongs");
  const resultRead = await store.from("hearth_thumbnail_direction_generation_results")
    .select("id,operation_id,reservation_id,result_json,provider_request_id,input_units,output_units,created_at")
    .eq("user_id", args.userId)
    .eq("workspace_id", args.workspaceId)
    .eq("workpiece_id", args.workpieceId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (resultRead.error) throw new Error(resultRead.error.message);
  const row = Array.isArray(resultRead.data) && isRecord(resultRead.data[0]) ? resultRead.data[0] : null;
  if (!row || !isRecord(row.result_json)) return null;
  const resultId = readString(row.id);
  const operationId = readString(row.operation_id);
  const reservationId = readString(row.reservation_id);
  if (!resultId || !operationId || !reservationId) throw new Error("Retained Thumbnail Directions identity is incomplete.");
  const receiptRead = await store.from("hearth_thumbnail_direction_canonical_receipts")
    .select("result_id,canonical_set_id,canonical_source_response_hash,committed_at")
    .eq("result_id", resultId)
    .limit(1);
  if (receiptRead.error) throw new Error(receiptRead.error.message);
  const canonicalReceipt = Array.isArray(receiptRead.data) && isRecord(receiptRead.data[0])
    ? receiptRead.data[0]
    : null;
  return {
    operationId,
    reservationId,
    resultId,
    canonicalReceipt,
    staged: {
      ...row.result_json,
      thumbnail_direction_result_id: resultId,
      created_at: row.created_at,
      provider_request_id: row.provider_request_id,
      input_units: row.input_units,
      output_units: row.output_units,
      replay: true,
      canonical_persisted: Boolean(canonicalReceipt),
      thumbnail_planning_subtree_hash: isRecord(row.result_json.thumbnail_authority)
        ? row.result_json.thumbnail_authority.planning_subtree_hash
        : null,
      expected_active_strategy_id: isRecord(row.result_json.thumbnail_authority)
        ? row.result_json.thumbnail_authority.active_strategy_id
        : null,
      expected_active_concept_set_id: isRecord(row.result_json.thumbnail_authority)
        ? row.result_json.thumbnail_authority.active_concept_set_id
        : null,
    },
  };
}

export async function readCanonicalThumbnailMetadata(args: {
  requestUrl: string;
  workpieceId: string;
  tongsApiToken: string | null | undefined;
  userAccessToken: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await serverTongsRequest({
    requestUrl: args.requestUrl,
    path: `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent("metadata.json")}`,
    apiToken: args.tongsApiToken,
    userAccessToken: args.userAccessToken,
    fetchImpl: args.fetchImpl,
    init: { method: "GET" },
  });
  const body = await response.json().catch(() => null) as unknown;
  if (!response.ok || !isRecord(body) || body.ok !== true || !isRecord(body.data)) {
    throw new Error("Canonical Thumbnail Directions metadata read failed.");
  }
  const fileRow = isRecord(body.file_row) ? body.file_row : null;
  return {
    metadata: body.data,
    metadataUpdatedAt: readString(fileRow?.updated_at),
    episodePackage: hydrateEpisodePackageV3(body.data),
  };
}

export async function commitAndFinalizeThumbnailDirections(args: {
  requestUrl: string;
  workpieceId: string;
  operationId: string;
  reservationId: string;
  input: PaidThumbnailDirectionInput;
  staged: JsonObject;
  gate: Gate;
  tongsApiToken: string | null | undefined;
  userAccessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<JsonObject> {
  const resultId = readString(args.staged.thumbnail_direction_result_id);
  const generatedAt = readString(args.staged.created_at);
  const stagedStyle = isRecord(args.staged.style_authority) ? args.staged.style_authority : null;
  const stagedTitles = Array.isArray(args.staged.title_inputs)
    ? args.staged.title_inputs.filter(isRecord)
    : [];
  if (!resultId || !generatedAt || !stagedStyle || stagedTitles.length !== 3) {
    throw new Error("Staged Thumbnail Directions identity is incomplete.");
  }
  const canonical = await readCanonicalThumbnailMetadata(args);
  const expectedSetId = deterministicUuid("paid-thumbnail-direction-set", resultId);
  const canonicalReplaySet = canonical.episodePackage.thumbnail.concept_sets.find((set) =>
    set.id === expectedSetId
    && set.generation_provenance.paid_operation_id === args.operationId
    && set.generation_provenance.paid_result_id === resultId);
  assertRecoverableThumbnailDirectionStaged({
    staged: args.staged,
    input: args.input,
    allowCanonicalReplay: Boolean(canonicalReplaySet),
  });
  const mutation = await buildPaidThumbnailDirectionMutation({
    episodePackage: canonical.episodePackage,
    rawText: String(args.staged.assistant_text ?? ""),
    identity: {
      resultId,
      operationId: args.operationId,
      approvalId: args.input.approved.approvalId,
      approvalRevision: args.input.approved.approvalRevision,
      scriptHash: args.input.approved.scriptHash,
      generatedAt,
      styleAuthority: stagedStyle,
      titleInputs: stagedTitles,
      expectedAuthorityHash: String(args.staged.thumbnail_planning_subtree_hash ?? ""),
      expectedStrategyId: readString(args.staged.expected_active_strategy_id),
      expectedSetId: readString(args.staged.expected_active_concept_set_id),
    },
  });
  if (mutation.disposition === "created") {
    const committed = await serverTongsRequest({
      requestUrl: args.requestUrl,
      path: `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      apiToken: args.tongsApiToken,
      userAccessToken: args.userAccessToken,
      fetchImpl: args.fetchImpl,
      init: {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: "metadata.json",
          content_type: "application/json",
          json: {
            ...canonical.metadata,
            updated_at: new Date().toISOString(),
            episode: serializeEpisodePackageV3(mutation.nextEpisodePackage),
          },
          expected_previous_updated_at: canonical.metadataUpdatedAt,
          written_by: { tool: "hearth", tool_version: "3", lane: "canonical" },
          event_name: "hearth.thumbnail.direction-set.generated.v1",
          event_payload: {
            schema: EPISODE_PACKAGE_V3_SCHEMA,
            concept_set_id: mutation.setId,
            paid_operation_id: args.operationId,
            paid_result_id: resultId,
          },
          correlation_id: crypto.randomUUID(),
        }),
      },
    });
    if (!committed.ok) {
      throw new Error(`Canonical Thumbnail Directions commit failed (${committed.status}).`);
    }
  }
  const readback = await readCanonicalThumbnailMetadata(args);
  const set = readback.episodePackage.thumbnail.concept_sets.find((entry) => entry.id === mutation.setId);
  if (!set || set.concept_revision_ids.length !== 3 || set.source_response_hash !== mutation.sourceResponseHash) {
    throw new Error("Canonical Thumbnail Directions readback failed.");
  }
  const finalized = await args.gate.rpc("finalize_hearth_thumbnail_direction_generation_result", {
    p_operation_id: args.operationId,
    p_reservation_id: args.reservationId,
    p_result_id: resultId,
    p_canonical_set_id: mutation.setId,
    p_canonical_source_response_hash: mutation.sourceResponseHash,
  });
  if (finalized.error || !isRecord(finalized.data)) {
    throw new Error(finalized.error?.message ?? "Thumbnail Directions canonical receipt failed.");
  }
  return finalized.data;
}
