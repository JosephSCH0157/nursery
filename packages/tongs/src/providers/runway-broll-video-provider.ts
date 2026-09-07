import RunwayML, { APIError } from "@runwayml/sdk";

export type RunwaySubmission = { taskId: string; acceptedResponse: Record<string, unknown> };
export type RunwayTask =
  | { state: "pending"; taskId: string; response: Record<string, unknown> }
  | { state: "completed"; taskId: string; outputUrl: string; response: Record<string, unknown> }
  | { state: "failed"; taskId: string; code: string; message: string; response: Record<string, unknown> };

export class RunwayTransportError extends Error {
  readonly ambiguous: boolean;
  readonly evidence: Record<string, unknown>;
  constructor(message: string, ambiguous: boolean, evidence: Record<string, unknown>) {
    super(message);
    this.ambiguous = ambiguous;
    this.evidence = evidence;
  }
}

type RunwayClient = Pick<RunwayML, "textToVideo" | "imageToVideo" | "tasks">;
function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function sanitizeProviderError(error: APIError<number, Headers, object>, input: { model: string; ratio: string; durationSeconds: number }): Record<string, unknown> {
  const body = asRecord(error.error);
  const issues = Array.isArray(body.issues) ? body.issues.map((value) => {
    const issue = asRecord(value);
    return { path: Array.isArray(issue.path) ? issue.path.filter((part) => typeof part === "string" || typeof part === "number") : [], message: typeof issue.message === "string" ? issue.message : "Invalid input", code: typeof issue.code === "string" ? issue.code : null };
  }) : [];
  return { stage: "submit", transmitted: true, response_received: true, endpoint: RunwayBrollVideoProvider.generatedCreateEndpoint, http_status: error.status, provider_request_id: error.headers?.get("x-request-id") ?? error.headers?.get("request-id") ?? null, provider_code: typeof body.code === "string" ? body.code : null, provider_message: typeof body.error === "string" ? body.error : error.message, validation_issues: issues, response_timestamp: new Date().toISOString(), sdk_version: RunwayBrollVideoProvider.sdkVersion, model: input.model, ratio: input.ratio, duration: input.durationSeconds };
}

export class RunwayBrollVideoProvider {
  readonly provider = "runway";
  static readonly sdkVersion = "4.13.1";
  static readonly generatedCreateEndpoint = "/v1/text_to_video";

  private readonly client: RunwayClient;
  private readonly fetchImpl: typeof fetch;
  constructor(apiKey: string, client?: RunwayClient, fetchImpl: typeof fetch = fetch) {
    if (!apiKey.trim() && !client) throw new Error("Runway API key is required");
    // Disable SDK retries: retrying a paid creation POST without provider idempotency is unsafe.
    this.client = client ?? new RunwayML({ apiKey, maxRetries: 0 });
    this.fetchImpl = fetchImpl;
  }

  async submit(input: { prompt: string; model: "gen4.5" | "seedance2"; durationSeconds: number; ratio: "1280:720" | "720:1280"; attemptId: string; referenceImages?: Array<{ mimeType: string; bytesBase64: string }> }): Promise<RunwaySubmission> {
    if (!input.prompt.trim() || input.prompt.length > 1000) throw new RunwayTransportError("Runway Gen-4.5 requires a motion prompt between 1 and 1000 UTF-16 code units.", false, { stage: "preflight", transmitted: false, prompt_length: input.prompt.length });
    try {
      const references = input.referenceImages ?? [];
      const accepted = references.length > 1
        ? await this.client.textToVideo.create({
            model: "seedance2",
            promptText: input.prompt,
            ratio: input.ratio,
            duration: input.durationSeconds,
            references: references.map((reference) => ({ uri: `data:${reference.mimeType};base64,${reference.bytesBase64}` })),
          }, { maxRetries: 0 })
        : references.length
        ? await this.client.imageToVideo.create({
            model: "gen4.5",
            promptText: input.prompt,
            ratio: input.ratio,
            duration: input.durationSeconds,
            promptImage: references.map((reference) => ({
              position: "first" as const,
              uri: `data:${reference.mimeType};base64,${reference.bytesBase64}`,
            })),
          }, { maxRetries: 0 })
        : await this.client.textToVideo.create({ model: "gen4.5", promptText: input.prompt, ratio: input.ratio, duration: input.durationSeconds }, { maxRetries: 0 });
      if (!accepted.id) throw new RunwayTransportError("Runway accepted the request but returned no task ID.", true, { stage: "accepted_response", transmitted: true, response_received: true });
      return { taskId: accepted.id, acceptedResponse: asRecord(accepted) };
    } catch (error) {
      if (error instanceof RunwayTransportError) throw error;
      if (error instanceof APIError && typeof error.status === "number" && error.status >= 400 && error.status < 500) {
        throw new RunwayTransportError("Runway rejected the request before creating a task.", false, sanitizeProviderError(error, input));
      }
      throw new RunwayTransportError("Runway submission outcome is unknown.", true, { stage: "submit", transmitted: "unknown", error_name: error instanceof Error ? error.name : "unknown", sdk_version: RunwayBrollVideoProvider.sdkVersion, endpoint: RunwayBrollVideoProvider.generatedCreateEndpoint, response_timestamp: new Date().toISOString(), model: input.model, ratio: input.ratio, duration: input.durationSeconds });
    }
  }

  async poll(taskId: string): Promise<RunwayTask> {
    const task = await this.client.tasks.retrieve(taskId, { maxRetries: 0 });
    const response = asRecord(task);
    if (task.status === "SUCCEEDED") {
      const outputUrl = task.output.find((value) => typeof value === "string" && value.startsWith("https://"));
      return outputUrl ? { state: "completed", taskId, outputUrl, response } : { state: "failed", taskId, code: "runway_output_missing", message: "Runway completed without a video output URL.", response };
    }
    if (task.status === "FAILED" || task.status === "CANCELLED") return { state: "failed", taskId, code: task.status === "FAILED" ? task.failureCode ?? "runway_failed" : "runway_cancelled", message: task.status === "FAILED" ? task.failure : "Runway task was cancelled.", response };
    return { state: "pending", taskId, response };
  }

  async download(outputUrl: string): Promise<Uint8Array> {
    const parsed = new URL(outputUrl);
    if (parsed.protocol !== "https:") throw new Error("Runway output URL must use HTTPS.");
    const response = await this.fetchImpl(outputUrl);
    if (!response.ok) throw new Error(`Runway output download failed with HTTP ${response.status}.`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > 200 * 1024 * 1024) throw new Error("Runway output exceeded the 200 MB acquisition limit.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > 200 * 1024 * 1024) throw new Error("Runway output exceeded the 200 MB acquisition limit.");
    return bytes;
  }
}
