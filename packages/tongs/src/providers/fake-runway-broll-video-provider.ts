import {
  RunwayTransportError,
  type RunwaySubmission,
  type RunwayTask,
} from "./runway-broll-video-provider.js";

export type FakeRunwayScenario =
  | "success"
  | "pending_then_success"
  | "provider_failure"
  | "definitive_rejection"
  | "submission_unknown";

export class FakeRunwayBrollVideoProvider {
  readonly provider = "runway";
  readonly scenario: FakeRunwayScenario;
  readonly outputUrl: string;
  submitCount = 0;
  pollCount = 0;
  downloadCount = 0;
  private taskId: string | null = null;

  constructor(
    scenario: FakeRunwayScenario = "success",
    outputUrl = "https://fake.runway.invalid/output.mp4",
  ) {
    this.scenario = scenario;
    this.outputUrl = outputUrl;
  }

  async submit(input: {
    prompt: string;
    model: "gen4.5" | "seedance2";
    durationSeconds: number;
    ratio: "1280:720" | "720:1280";
    attemptId: string;
    referenceImages?: Array<{ mimeType: string; bytesBase64: string }>;
  }): Promise<RunwaySubmission> {
    this.submitCount += 1;
    if (this.scenario === "definitive_rejection") {
      throw new RunwayTransportError("Fake Runway rejected before task creation.", false, {
        stage: "submit",
        transmitted: true,
        response_received: true,
        http_status: 400,
        provider_code: "fake_rejection",
      });
    }
    if (this.scenario === "submission_unknown") {
      throw new RunwayTransportError("Fake Runway submission outcome is unknown.", true, {
        stage: "submit",
        transmitted: "unknown",
        response_received: false,
      });
    }
    this.taskId = `fake-runway-${input.attemptId}`;
    return {
      taskId: this.taskId,
      acceptedResponse: {
        id: this.taskId,
        status: "PENDING",
        fake: true,
        model: input.model,
        duration_seconds: input.durationSeconds,
        ratio: input.ratio,
      },
    };
  }

  async poll(taskId: string): Promise<RunwayTask> {
    this.pollCount += 1;
    if (!this.taskId || taskId !== this.taskId) throw new Error("Unknown fake Runway task ID.");
    if (this.scenario === "pending_then_success" && this.pollCount === 1) {
      return { state: "pending", taskId, response: { id: taskId, status: "PENDING", fake: true } };
    }
    if (this.scenario === "provider_failure") {
      return {
        state: "failed",
        taskId,
        code: "fake_provider_failure",
        message: "Fake Runway billed failure.",
        response: { id: taskId, status: "FAILED", fake: true },
      };
    }
    return {
      state: "completed",
      taskId,
      outputUrl: this.outputUrl,
      response: { id: taskId, status: "SUCCEEDED", output: [this.outputUrl], fake: true },
    };
  }

  async download(outputUrl: string): Promise<Uint8Array> {
    this.downloadCount += 1;
    if (outputUrl !== this.outputUrl) throw new Error("Unknown fake Runway output URL.");
    return new TextEncoder().encode("fake-runway-video");
  }
}
