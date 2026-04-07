import {
  readForgeFfmpegClientConfig,
  transcodeToWavWithForgeFfmpeg,
  type ForgeFfmpegClientConfig,
  type ForgeFfmpegTranscodeResult,
} from "../server/forge-ffmpeg-client";

export type HammerForgeFfmpegClientConfig = ForgeFfmpegClientConfig;
export type HammerForgeFfmpegTranscodeResult = ForgeFfmpegTranscodeResult;

export function readHammerForgeFfmpegClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): HammerForgeFfmpegClientConfig | null {
  return readForgeFfmpegClientConfig(env, {
    baseUrlEnvNames: ["HAMMER_FORGE_FFMPEG_BASE_URL", "FORGE_FFMPEG_BASE_URL"],
    timeoutEnvNames: ["HAMMER_FORGE_FFMPEG_TIMEOUT_MS", "FORGE_FFMPEG_TIMEOUT_MS"],
    maxAttemptsEnvNames: ["HAMMER_FORGE_FFMPEG_MAX_ATTEMPTS", "FORGE_FFMPEG_MAX_ATTEMPTS"],
    retryDelayEnvNames: ["HAMMER_FORGE_FFMPEG_RETRY_DELAY_MS", "FORGE_FFMPEG_RETRY_DELAY_MS"],
  });
}

export async function transcodeToWorkingWavWithForgeFfmpeg(args: {
  client: HammerForgeFfmpegClientConfig;
  sourceBytes: Buffer;
  sourceFilename?: string | null;
  contentType?: string | null;
}): Promise<HammerForgeFfmpegTranscodeResult> {
  return transcodeToWavWithForgeFfmpeg(args);
}
