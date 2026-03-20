import fs from "node:fs";
import {
  buildHammerMediaBackboneRuntimeSummary,
  type HammerMediaBackendPreference,
  type HammerMediaBackboneRuntimeSummary,
} from "../../hammer/src/media/hammerMediaBackbone";

function readTrimmed(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBackendPreference(value: unknown): HammerMediaBackendPreference {
  const normalized = readTrimmed(value)?.toLowerCase();
  if (normalized === "builtin" || normalized === "ffmpeg") {
    return normalized;
  }
  return "auto";
}

function fileExists(absolutePath: string | null): boolean {
  return Boolean(absolutePath && fs.existsSync(absolutePath));
}

export function detectHammerMediaRuntime(env: NodeJS.ProcessEnv = process.env): HammerMediaBackboneRuntimeSummary {
  const ffmpegBin = readTrimmed(env.HAMMER_FFMPEG_BIN);
  const ffprobeBin = readTrimmed(env.HAMMER_FFPROBE_BIN);
  return buildHammerMediaBackboneRuntimeSummary({
    preferredBackend: readBackendPreference(env.HAMMER_MEDIA_BACKEND),
    ffmpegBin,
    ffprobeBin,
    ffmpegAvailable: fileExists(ffmpegBin),
    ffprobeAvailable: fileExists(ffprobeBin),
  });
}
