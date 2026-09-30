import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import type {
  OwnerImageExecutionContext,
  OwnerImageExecutionExecutor,
} from "../../../../packages/tongs/src/workpiece-commit-api";
import {
  ImageProviderRequestError,
  OpenAiImageProvider,
  THUMBNAIL_BASE_GENERATION_CONTRACT,
  TIMELINE_IMAGE_GENERATION_CONTRACT,
  type GenerateImageOutput,
  type ImageProvider,
} from "../../../../packages/tongs/src/providers/image-provider";
import {
  ForgeOwnerAuthorizationError,
  ForgeOwnerExecutionCoordinator,
  ForgeOwnerProviderBoundaryError,
  deriveForgeOwnerAttemptIdentity,
  deriveForgeOwnerOperationIdentity,
  forgeOwnerCredentialIdentityHash,
  requireForgeOwnerExecutionAuthority,
  type OwnerAttemptSnapshot,
  type OwnerAuthorityReader,
  type OwnerCostRpcGate,
  type OwnerFinancialEnvironment,
  type OwnerRuntimeEnvironment,
} from "../accounting/forge-owner-execution-coordinator";

type Json = Record<string, unknown>;

export const HEARTH_OWNER_OPENAI_IMAGE_RATE = Object.freeze({
  amountMicrosPerImage: 167_450,
  revisionId: "19630000-0000-4000-8000-000000000001",
  pricingEvidenceSha256: "515ee31f6c69074f5df98590ccc15cbca908e1bef5bbf34acb40194f7b3ecaea",
  evidenceSource: "forge-openai-image-rate:gpt-image-2-2026-04-21:1536x1024:high:png:2026-09-23",
});

function object(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function rpc(gate: OwnerCostRpcGate, name: string, args?: Json): Promise<unknown> {
  const result = await gate.rpc(name, args);
  if (result.error) throw new Error(`${name}: ${result.error.message ?? "unknown error"}`);
  return result.data;
}

async function financialEnvironment(gate: OwnerCostRpcGate): Promise<OwnerFinancialEnvironment> {
  const data = object(await rpc(gate, "read_financial_runtime_environment"));
  const value = data?.financial_environment;
  if (value !== "test" && value !== "live") throw new Error("Owner financial environment is unavailable");
  return value;
}

function runtimeEnvironment(): OwnerRuntimeEnvironment {
  const value = (process.env.CONTEXT ?? process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (value === "production") return "production";
  if (value === "deploy-preview" || value === "preview") return "preview";
  return "development";
}

function sha256BytesBase64(value: string): string {
  return crypto.createHash("sha256").update(Buffer.from(value, "base64")).digest("hex");
}

function byteLengthBase64(value: string): number {
  return Buffer.from(value, "base64").byteLength;
}

function usageEvidence(image: GenerateImageOutput, imageCount: number): Json {
  return {
    image_count: imageCount,
    text_input_tokens: image.usage?.textInputTokens ?? null,
    cached_text_input_tokens: image.usage?.cachedTextInputTokens ?? null,
    image_input_tokens: image.usage?.imageInputTokens ?? null,
    cached_image_input_tokens: image.usage?.cachedImageInputTokens ?? null,
    image_output_tokens: image.usage?.imageOutputTokens ?? null,
    total_tokens: image.usage?.totalTokens ?? null,
  };
}

function recoverOutputs(attempt: OwnerAttemptSnapshot): GenerateImageOutput[] | null {
  const response = attempt.events?.find((event) => event.lifecycle_state === "response_captured");
  const evidence = object(response?.private_provider_evidence);
  const outputs = Array.isArray(evidence?.outputs) ? evidence.outputs : [];
  const recovered = outputs.flatMap((candidate) => {
    const row = object(candidate);
    const bytesBase64 = text(row?.bytes_base64);
    const mimeType = text(row?.mime_type);
    if (!bytesBase64 || mimeType !== "image/png") return [];
    return [{
      bytesBase64,
      mimeType,
      provider: "openai",
      providerRequestId: text(response?.provider_reference_id),
      revisedPrompt: text(row?.revised_prompt),
      tokensUsed: null,
      usage: null,
      providerResponseId: text(row?.provider_response_id),
      responseEvidence: { recovered_from_owner_cost_provider_evidence: true },
    } satisfies GenerateImageOutput];
  });
  return recovered.length ? recovered : null;
}

function validateContract(input: Parameters<OwnerImageExecutionExecutor>[0]): void {
  const contract = input.routeCode === "hearth.thumbnail_base_generation"
    ? THUMBNAIL_BASE_GENERATION_CONTRACT
    : TIMELINE_IMAGE_GENERATION_CONTRACT;
  const body = input.exactProviderRequest;
  if (input.imageCount !== contract.imageCount
    || body.model !== contract.model
    || body.size !== contract.size
    || body.quality !== contract.quality
    || body.output_format !== contract.outputFormat
    || (input.imageCount === 2 ? body.n !== 2 : body.n != null)) {
    throw new Error("Owner image request does not match the canonical Hearth image contract");
  }
  if (!text(body.prompt) || !/^[0-9a-f]{64}$/.test(input.providerBodySha256)) {
    throw new Error("Owner image request is missing its exact prompt or provider-body fingerprint");
  }
  const stable = input.stableOperationInput;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const sha = /^[0-9a-f]{64}$/;
  if (input.routeCode === "hearth.thumbnail_base_generation") {
    if (!uuid.test(String(stable.concept_revision_id ?? ""))
      || !uuid.test(String(stable.render_recipe_id ?? ""))
      || !Number.isSafeInteger(stable.render_recipe_revision)
      || Number(stable.render_recipe_revision) <= 0
      || !sha.test(String(stable.prompt_package_hash ?? ""))) {
      throw new Error("Owner Thumbnail Base requires current canonical recipe, concept, and prompt-package authority");
    }
  } else if (!uuid.test(String(stable.image_map_revision_id ?? ""))
    || !uuid.test(String(stable.prompt_revision_id ?? ""))
    || !text(stable.image_moment_id)
    || !sha.test(String(stable.prompt_content_hash ?? ""))
    || !sha.test(String(stable.semantic_authority_hash ?? ""))) {
    throw new Error("Owner Timeline Image requires current canonical map, prompt, and semantic authority");
  }
}

export function createOwnerHearthImageExecutionExecutor(args: {
  gate: OwnerCostRpcGate;
  coordinator: ForgeOwnerExecutionCoordinator;
  authorityReader: OwnerAuthorityReader;
  credential?: string;
  providerFactory?: (credential: string) => ImageProvider;
}): OwnerImageExecutionExecutor {
  return async (input) => {
    try {
      await requireForgeOwnerExecutionAuthority({
        reader: args.authorityReader,
        authenticatedUserId: input.authenticatedUserId,
        workspaceId: input.workspaceId,
        routeCode: input.routeCode,
      });
    } catch (error) {
      if (error instanceof ForgeOwnerAuthorizationError) return null;
      throw error;
    }

    const credential = args.credential?.trim();
    if (!credential) throw new Error("The isolated Hearth owner OpenAI image credential is unavailable");
    validateContract(input);

    const financial = await financialEnvironment(args.gate);
    const runtime = runtimeEnvironment();
    const contract = input.routeCode === "hearth.thumbnail_base_generation"
      ? THUMBNAIL_BASE_GENERATION_CONTRACT
      : TIMELINE_IMAGE_GENERATION_CONTRACT;
    const sku = `${contract.model}:${contract.size}:${contract.quality}:n${input.imageCount}`;
    const operation = deriveForgeOwnerOperationIdentity({
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      originatingTool: "hearth",
      operationType: input.routeCode,
      stableOperationInput: {
        route_code: input.routeCode,
        workspace_id: input.workspaceId,
        workpiece_id: input.workpieceId,
        product_operation_id: input.productOperationId,
        model: contract.model,
        size: contract.size,
        quality: contract.quality,
        output_format: contract.outputFormat,
        image_count: input.imageCount,
        ...input.stableOperationInput,
      },
      exactRequestInput: {
        provider_body_sha256: input.providerBodySha256,
        provider_request: input.exactProviderRequest,
      },
    });
    const credentialIdentityHash = forgeOwnerCredentialIdentityHash(credential);
    const attemptIdentity = deriveForgeOwnerAttemptIdentity({
      operation,
      attemptNumber: 1,
      provider: "openai",
      service: "image_generation",
      model: contract.model,
      sku,
      credentialIdentityHash,
      exactProviderRequest: input.exactProviderRequest,
    });
    const provider = (args.providerFactory ?? ((secret) => new OpenAiImageProvider(secret, contract.model)))(credential);
    if (input.imageCount === 2 && typeof provider.generateImages !== "function") {
      throw new Error("The isolated owner image provider does not support the canonical two-output request");
    }
    let canonicalResult: Record<string, unknown> | null = null;
    const context = (providerReferenceId: string): OwnerImageExecutionContext => ({
      ownerOperationId: operation.operationId,
      ownerOperationKey: operation.operationKey,
      ownerRequestFingerprint: operation.requestFingerprint,
      ownerCostAttemptId: attemptIdentity.attemptId,
      financialEnvironment: financial,
      runtimeEnvironment: runtime,
      providerReferenceId,
    });

    const execution = await args.coordinator.executeAttempt<GenerateImageOutput[], GenerateImageOutput[]>({
      authenticatedUserId: input.authenticatedUserId,
      routeCode: input.routeCode,
      operation: {
        identity: operation,
        runtimeEnvironment: runtime,
        originatingTool: "hearth",
        operationType: input.routeCode,
        attribution: { workspaceId: input.workspaceId, workpieceId: input.workpieceId },
        creationEvidence: {
          schema: "forge.hearth.owner-image-operation.v1",
          product_operation_id: input.productOperationId,
          provider_body_sha256: input.providerBodySha256,
          image_count: input.imageCount,
        },
      },
      attempt: {
        attemptNumber: 1,
        provider: "openai",
        service: "image_generation",
        model: contract.model,
        sku,
        credentialIdentityHash,
        exactProviderRequest: input.exactProviderRequest,
        defaultCostComponent: "openai_image_generation",
        authorizationEvidence: {
          schema: "forge.hearth.owner-image-authorization.v1",
          credential_source: "openai_hearth_owner_image_api_key",
        },
        submissionEvidence: {
          endpoint: contract.endpoint,
          provider_body_sha256: input.providerBodySha256,
          model: contract.model,
          size: contract.size,
          quality: contract.quality,
          image_count: input.imageCount,
        },
      },
      readPersistedResult: async () => {
        const persisted = object(await rpc(args.gate, "read_owner_hearth_image_result", {
          p_owner_cost_attempt_id: attemptIdentity.attemptId,
          p_route_code: input.routeCode,
        }));
        if (!persisted) return { found: false };
        const providerReferenceId = text(persisted.provider_request_id);
        if (!providerReferenceId) return { found: false };
        canonicalResult = await input.readPersistedResult(context(providerReferenceId));
        return canonicalResult ? { found: true, value: [] } : { found: false };
      },
      submitProvider: async () => {
        const startedAt = Date.now();
        let images: GenerateImageOutput[];
        try {
          images = input.imageCount === 1
            ? [await provider.generateImage({
                prompt: String(input.exactProviderRequest.prompt ?? ""),
                model: contract.model,
                size: contract.size,
                quality: contract.quality,
              })]
            : await provider.generateImages!({
                prompt: String(input.exactProviderRequest.prompt ?? ""),
                model: contract.model,
                size: contract.size,
                quality: contract.quality,
                imageCount: 2,
                deadlineMs: TIMELINE_IMAGE_GENERATION_CONTRACT.providerDeadlineMs,
              });
        } catch (error) {
          if (error instanceof ImageProviderRequestError) {
            throw new ForgeOwnerProviderBoundaryError({
              message: error.message,
              outcome: error.delivery === "definitive_response" ? "definitively_rejected" : "submission_unknown",
              providerReferenceId: error.providerRequestId,
              normalizedUsage: {},
              privateProviderEvidence: {
                schema: "forge.hearth.owner-image-provider-error.v1",
                status: error.status,
                evidence: error.evidence,
              },
              cause: error,
            });
          }
          throw error;
        }
        const providerReferenceId = images[0]?.providerRequestId ?? images[0]?.providerResponseId ?? null;
        const normalizedImages = images.map((image) => ({ ...image, providerRequestId: providerReferenceId }));
        return {
          capture: normalizedImages,
          providerReferenceId,
          normalizedUsage: {
            ...usageEvidence(normalizedImages[0]!, input.imageCount),
            model: contract.model,
            size: contract.size,
            quality: contract.quality,
            output_format: contract.outputFormat,
            elapsed_ms: Date.now() - startedAt,
          },
          privateProviderEvidence: {
            schema: "forge.hearth.owner-image-provider-response.v1",
            provider_response_id: normalizedImages[0]?.providerResponseId ?? null,
            outputs: normalizedImages.map((image, index) => ({
              child_ordinal: index + 1,
              bytes_base64: image.bytesBase64,
              mime_type: image.mimeType,
              byte_size: byteLengthBase64(image.bytesBase64),
              content_sha256: sha256BytesBase64(image.bytesBase64),
              revised_prompt: image.revisedPrompt,
              provider_response_id: image.providerResponseId,
              provider_response: image.responseEvidence,
            })),
          },
          valuations: [{
            costComponent: "openai_image_generation",
            basis: "usage_calculated" as const,
            amountMicros: HEARTH_OWNER_OPENAI_IMAGE_RATE.amountMicrosPerImage * input.imageCount,
            currency: "USD",
            recognitionMode: "journal_recognized" as const,
            rateRevisionId: HEARTH_OWNER_OPENAI_IMAGE_RATE.revisionId,
            normalizedUsage: { image_count: input.imageCount, unit: "generated_image" },
            privateEvidence: {
              unit_amount_micros: HEARTH_OWNER_OPENAI_IMAGE_RATE.amountMicrosPerImage,
              pricing_evidence_sha256: HEARTH_OWNER_OPENAI_IMAGE_RATE.pricingEvidenceSha256,
              pricing_evidence_source: HEARTH_OWNER_OPENAI_IMAGE_RATE.evidenceSource,
              customer_markup_applied: false,
              customer_finance_involved: false,
            },
          }],
        };
      },
      parseResult: (images) => images,
      validateResult: (images) => {
        if (images.length !== input.imageCount
          || images.some((image) => image.provider !== "openai"
            || image.mimeType !== "image/png"
            || !image.bytesBase64
            || !image.providerRequestId)) {
          throw new Error("Owner image provider result does not match the canonical output contract");
        }
      },
      persistResult: async (images) => {
        const providerReferenceId = images[0]!.providerRequestId!;
        canonicalResult = await input.persistCanonical(images, context(providerReferenceId));
      },
      recoverCapturedResult: async (attempt) => {
        const images = recoverOutputs(attempt);
        return images?.length === input.imageCount ? { value: images } : null;
      },
    });

    if (execution.state !== "succeeded") return execution;
    if (!canonicalResult) {
      const providerReferenceId = execution.value[0]?.providerRequestId;
      if (providerReferenceId) canonicalResult = await input.readPersistedResult(context(providerReferenceId));
    }
    if (!canonicalResult) throw new Error("Owner image execution completed without a canonical result");
    return {
      state: "succeeded",
      result: canonicalResult,
      operationId: execution.operationId,
      attemptId: execution.attemptId,
      replay: execution.replay,
    };
  };
}
