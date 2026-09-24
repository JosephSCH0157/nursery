export type ImageAspect = "1:1" | "16:9" | "9:16";

export type GenerateImageInput = {
  prompt: string;
  aspect?: ImageAspect | string | null;
  size?: string | null;
  model?: string | null;
  quality?: "low" | "medium" | "high";
  imageCount?: number;
  deadlineMs?: number;
  referenceImage?: {
    bytesBase64: string;
    mimeType: "image/png" | "image/jpeg" | "image/webp";
    purpose: "subject" | "composition" | "style";
  } | null;
};

export type ImageProviderUsage = {
  textInputTokens: number | null;
  cachedTextInputTokens: number | null;
  imageInputTokens: number | null;
  cachedImageInputTokens: number | null;
  imageOutputTokens: number | null;
  totalTokens: number | null;
  raw: Record<string, unknown>;
};

export type GenerateImageOutput = {
  bytesBase64: string;
  mimeType: string;
  provider: string;
  providerRequestId: string | null;
  revisedPrompt: string | null;
  tokensUsed: number | null;
  usage: ImageProviderUsage | null;
  providerResponseId: string | null;
  responseEvidence: Record<string, unknown>;
};

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
  generateImages?(input: GenerateImageInput): Promise<GenerateImageOutput[]>;
}

export const TIMELINE_IMAGE_GENERATION_CONTRACT = Object.freeze({
  routeCode: "hearth.timeline_image_generation",
  provider: "openai",
  model: "gpt-image-2-2026-04-21",
  endpoint: "/v1/images/generations",
  size: "1536x1024",
  quality: "high" as const,
  outputFormat: "png" as const,
  imageCount: 2 as const,
  maximumAttempts: 1 as const,
  referenceImagesAllowed: false as const,
  providerDeadlineMs: 180_000,
  attemptLeaseSeconds: 210,
  outerRequestDeadlineMs: 240_000,
});

export const THUMBNAIL_BASE_GENERATION_CONTRACT = Object.freeze({
  routeCode: "hearth.thumbnail_base_generation",
  provider: "openai",
  model: "gpt-image-2-2026-04-21",
  endpoint: "/v1/images/generations",
  size: "1536x1024",
  quality: "high" as const,
  outputFormat: "png" as const,
  imageCount: 1 as const,
  maximumAttempts: 1 as const,
  referenceImagesAllowed: false as const,
});

export type OpenAiImageGenerationRequestBody = {
  model: string;
  prompt: string;
  size: string;
  quality: "low" | "medium" | "high";
  output_format: "png";
  n?: number;
};

/** Canonical no-reference request. Property order is part of the serialized-byte contract. */
export function buildOpenAiImageGenerationRequestBody(input: Pick<GenerateImageInput, "prompt" | "model" | "size" | "aspect" | "quality" | "imageCount">,
  defaultModel: string = THUMBNAIL_BASE_GENERATION_CONTRACT.model): OpenAiImageGenerationRequestBody {
  const prompt = readString(input.prompt);
  if (!prompt) throw new Error("Image prompt is required");
  return {
    model: readString(input.model) ?? defaultModel,
    prompt,
    size: readString(input.size) ?? mapAspectToSize(input.aspect),
    quality: input.quality ?? "high",
    output_format: "png",
    ...(typeof input.imageCount === "number" ? { n: input.imageCount } : {}),
  };
}

export function serializeOpenAiImageGenerationRequestBody(body: OpenAiImageGenerationRequestBody): string {
  return JSON.stringify(body);
}

export async function hashOpenAiImageGenerationRequestBody(body: OpenAiImageGenerationRequestBody): Promise<string> {
  const bytes = new TextEncoder().encode(serializeOpenAiImageGenerationRequestBody(body));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

export const IMAGE_REFERENCE_CONTRACT_VERSION = "forge-image-reference-v2" as const;

export function buildImageReferenceInstruction(purpose: NonNullable<GenerateImageInput["referenceImage"]>["purpose"]): string {
  if (purpose === "subject") {
    return "Treat the attached image as the authoritative identity reference for the primary subject. Preserve the subject's recognizable factual identity and distinctive visible characteristics, including its physical shape, proportions, colors, livery, logos, decals, written markings, county or agency identifiers, graphics, and other identifying features. Do not remove, replace, simplify, genericize, or invent identifying branding or markings unless the requested image direction explicitly requires that change. Keep visible lettering and logos as faithful and legible as the image-generation system permits.";
  }
  if (purpose === "composition") {
    return "Use the attached image only as a composition reference: follow its framing, camera angle, subject placement, depth, and visual balance. Do not treat the depicted subject, branding, logos, decals, written markings, or style as required content unless the requested image direction separately asks for them.";
  }
  return "Use the attached image only as a style reference: follow its lighting, palette, texture, mood, and rendering treatment. Do not copy its specific subject identity, composition, branding, logos, decals, or written markings unless the requested image direction separately asks for them.";
}

export class ImageProviderRequestError extends Error {
  readonly delivery: "definitive_response" | "ambiguous_transport";
  readonly status: number | null;
  readonly providerRequestId: string | null;
  readonly evidence: Record<string, unknown>;

  constructor(message: string, options: {
    delivery: "definitive_response" | "ambiguous_transport";
    status?: number | null;
    providerRequestId?: string | null;
    evidence?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "ImageProviderRequestError";
    this.delivery = options.delivery;
    this.status = options.status ?? null;
    this.providerRequestId = options.providerRequestId ?? null;
    this.evidence = options.evidence ?? {};
  }
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function mapAspectToSize(aspect: ImageAspect | string | null | undefined): string {
  const normalized = readString(aspect)?.toLowerCase();
  if (!normalized || normalized === "1:1") return "1024x1024";
  if (normalized === "16:9" || normalized === "landscape") return "1536x1024";
  if (normalized === "9:16" || normalized === "portrait") return "1024x1536";
  return "1024x1024";
}

function extractUsageTokens(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const total = (usage as Record<string, unknown>).total_tokens;
  if (typeof total === "number" && Number.isFinite(total) && total >= 0) return total;
  return null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function extractOpenAiImageUsage(payload: unknown): ImageProviderUsage | null {
  if (!payload || typeof payload !== "object") return null;
  const usage = (payload as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const row = usage as Record<string, unknown>;
  const details = row.input_tokens_details && typeof row.input_tokens_details === "object" && !Array.isArray(row.input_tokens_details)
    ? row.input_tokens_details as Record<string, unknown>
    : {};
  const text = nonNegativeInteger(details.text_tokens);
  const image = nonNegativeInteger(details.image_tokens);
  const cachedText = nonNegativeInteger(details.cached_text_tokens ?? details.cached_tokens);
  const cachedImage = nonNegativeInteger(details.cached_image_tokens);
  const input = nonNegativeInteger(row.input_tokens);
  const totalText = text ?? (image == null ? input : input == null ? null : Math.max(0, input - image));
  return {
    // OpenAI reports cached tokens as a subset of the corresponding input
    // category. Split that subset out so compound pricing never charges the
    // same tokens at both cached and non-cached rates.
    textInputTokens: totalText == null ? null : Math.max(0, totalText - (cachedText ?? 0)),
    cachedTextInputTokens: cachedText,
    imageInputTokens: image == null ? null : Math.max(0, image - (cachedImage ?? 0)),
    cachedImageInputTokens: cachedImage,
    imageOutputTokens: nonNegativeInteger(row.output_tokens),
    totalTokens: nonNegativeInteger(row.total_tokens),
    raw: row,
  };
}

function parseOpenAiImagePayload(payload: unknown): Array<{ b64: string; revisedPrompt: string | null }> {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return [];
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const b64 = readString(row.b64_json);
    return b64 ? [{ b64, revisedPrompt: readString(row.revised_prompt) }] : [];
  });
}

function extractOpenAiError(detail: string): string | null {
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } };
    return readString(parsed?.error?.message);
  } catch {
    return null;
  }
}

export class OpenAiImageProvider implements ImageProvider {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string, model = "gpt-image-2-2026-04-21") {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new Error("OpenAiImageProvider requires non-empty api key");
    }
    this.apiKey = trimmedKey;
    this.model = model.trim() || "gpt-image-2-2026-04-21";
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const images = await this.generateImages(input);
    if (!images[0]) throw new Error("OpenAI image generation returned no image payload");
    return images[0];
  }

  async generateImages(input: GenerateImageInput): Promise<GenerateImageOutput[]> {
    const prompt = readString(input.prompt);
    if (!prompt) {
      throw new Error("Image prompt is required");
    }

    const size = readString(input.size) ?? mapAspectToSize(input.aspect);
    const model = readString(input.model) ?? this.model;
    const quality = input.quality ?? "high";

    let response: Response;
    try {
      if (input.referenceImage) {
        const binary = Uint8Array.from(atob(input.referenceImage.bytesBase64), (character) => character.charCodeAt(0));
        const form = new FormData();
        form.set("model", model);
        form.set("prompt", `${prompt}\n\nREFERENCE CONTRACT (${input.referenceImage.purpose.toUpperCase()}): ${buildImageReferenceInstruction(input.referenceImage.purpose)}`);
        form.set("size", size);
        form.set("quality", quality);
        form.set("output_format", "png");
        form.set("image", new Blob([new Uint8Array(binary)], { type: input.referenceImage.mimeType }), `reference.${input.referenceImage.mimeType.split("/")[1]}`);
        response = await fetch("https://api.openai.com/v1/images/edits", {
          method: "POST", headers: { authorization: `Bearer ${this.apiKey}` }, body: form,
        });
      } else {
        const requestBody = buildOpenAiImageGenerationRequestBody({ ...input, prompt, size, model, quality }, this.model);
        response = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
          body: serializeOpenAiImageGenerationRequestBody(requestBody),
          signal: AbortSignal.timeout(input.deadlineMs ?? TIMELINE_IMAGE_GENERATION_CONTRACT.providerDeadlineMs),
        });
      }
    } catch (error) {
      throw new ImageProviderRequestError(error instanceof Error ? error.message : "OpenAI image request transport failed", {
        delivery: "ambiguous_transport",
        evidence: { endpoint: input.referenceImage ? "/v1/images/edits" : "/v1/images/generations", model, size, quality },
      });
    }

    const providerRequestId = response.headers.get("x-request-id");
    const rawText = await response.text();

    if (!response.ok) {
      const parsedError = extractOpenAiError(rawText);
      const message = parsedError ?? rawText.trim() ?? `OpenAI image generation failed (${response.status})`;
      throw new ImageProviderRequestError(message, {
        delivery: "definitive_response",
        status: response.status,
        providerRequestId,
        evidence: { endpoint: input.referenceImage ? "/v1/images/edits" : "/v1/images/generations", model, size, quality, status: response.status, body: rawText.slice(0, 4096) },
      });
    }

    let payload: unknown = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    const parsed = parseOpenAiImagePayload(payload);
    if (!parsed.length) {
      const payloadRecord = payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload as Record<string, unknown>
        : {};
      throw new ImageProviderRequestError("OpenAI image generation returned no image payload", {
        delivery: "definitive_response",
        status: response.status,
        providerRequestId,
        evidence: {
          endpoint: input.referenceImage ? "/v1/images/edits" : "/v1/images/generations", model, size, quality, status: response.status,
          response_id: readString(payloadRecord.id), usage: payloadRecord.usage ?? null,
          response_parseable: payload !== null,
        },
      });
    }

    const payloadRecord = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown>
      : {};
    const usage = extractOpenAiImageUsage(payload);
    const providerResponseId = readString(payloadRecord.id);
    return parsed.map((image) => ({
      bytesBase64: image.b64,
      mimeType: "image/png",
      provider: "openai",
      providerRequestId,
      revisedPrompt: image.revisedPrompt,
      tokensUsed: extractUsageTokens(payload),
      usage,
      providerResponseId,
      responseEvidence: {
        id: providerResponseId,
        created: payloadRecord.created ?? null,
        model: payloadRecord.model ?? model,
        usage: usage?.raw ?? null,
        data: Array.isArray(payloadRecord.data) ? payloadRecord.data : [],
        operation: input.referenceImage ? "edit" : "generation",
        reference_purpose: input.referenceImage?.purpose ?? null,
        reference_contract_version: input.referenceImage ? IMAGE_REFERENCE_CONTRACT_VERSION : null,
      },
    }));
  }
}
