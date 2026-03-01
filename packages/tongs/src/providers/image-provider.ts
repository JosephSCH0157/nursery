export type ImageAspect = "1:1" | "16:9" | "9:16";

export type GenerateImageInput = {
  prompt: string;
  aspect?: ImageAspect | string | null;
  size?: string | null;
  model?: string | null;
};

export type GenerateImageOutput = {
  bytesBase64: string;
  mimeType: string;
  provider: string;
  providerRequestId: string | null;
  revisedPrompt: string | null;
  tokensUsed: number | null;
};

export interface ImageProvider {
  generateImage(input: GenerateImageInput): Promise<GenerateImageOutput>;
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

function parseOpenAiImagePayload(payload: unknown): { b64: string; revisedPrompt: string | null } | null {
  if (!payload || typeof payload !== "object") return null;
  const data = (payload as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0];
  if (!first || typeof first !== "object") return null;
  const row = first as Record<string, unknown>;
  const b64 = readString(row.b64_json);
  if (!b64) return null;
  return {
    b64,
    revisedPrompt: readString(row.revised_prompt),
  };
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

  constructor(apiKey: string, model = "gpt-image-1") {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      throw new Error("OpenAiImageProvider requires non-empty api key");
    }
    this.apiKey = trimmedKey;
    this.model = model.trim() || "gpt-image-1";
  }

  async generateImage(input: GenerateImageInput): Promise<GenerateImageOutput> {
    const prompt = readString(input.prompt);
    if (!prompt) {
      throw new Error("Image prompt is required");
    }

    const size = readString(input.size) ?? mapAspectToSize(input.aspect);
    const model = readString(input.model) ?? this.model;

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        quality: "high",
        output_format: "png",
      }),
    });

    const providerRequestId = response.headers.get("x-request-id");
    const rawText = await response.text();

    if (!response.ok) {
      const parsedError = extractOpenAiError(rawText);
      const message = parsedError ?? rawText.trim() ?? `OpenAI image generation failed (${response.status})`;
      throw new Error(message);
    }

    let payload: unknown = null;
    try {
      payload = rawText ? JSON.parse(rawText) : null;
    } catch {
      payload = null;
    }

    const parsed = parseOpenAiImagePayload(payload);
    if (!parsed) {
      throw new Error("OpenAI image generation returned no image payload");
    }

    return {
      bytesBase64: parsed.b64,
      mimeType: "image/png",
      provider: "openai",
      providerRequestId,
      revisedPrompt: parsed.revisedPrompt,
      tokensUsed: extractUsageTokens(payload),
    };
  }
}

