import fs from "node:fs";
import { spawnSync } from "node:child_process";
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

export type HammerMediaRuntimeProbe = (binary: string) => boolean;

function probeBinaryOnPath(binary: string): boolean {
  try {
    const result = spawnSync(binary, ["-version"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 2_000,
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

type ResolvedBinary = {
  bin: string | null;
  available: boolean;
};

function resolveBinary(args: {
  configuredValue: string | null;
  fallbackCommand: string;
  probe: HammerMediaRuntimeProbe;
}): ResolvedBinary {
  if (args.configuredValue) {
    const configuredAvailable = fileExists(args.configuredValue) || args.probe(args.configuredValue);
    if (configuredAvailable) {
      return {
        bin: args.configuredValue,
        available: true,
      };
    }
    if (args.probe(args.fallbackCommand)) {
      return {
        bin: args.fallbackCommand,
        available: true,
      };
    }
    return {
      bin: args.configuredValue,
      available: false,
    };
  }

  if (args.probe(args.fallbackCommand)) {
    return {
      bin: args.fallbackCommand,
      available: true,
    };
  }

  return {
    bin: null,
    available: false,
  };
}

export function detectHammerMediaRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options?: {
    probeBinary?: HammerMediaRuntimeProbe;
  },
): HammerMediaBackboneRuntimeSummary {
  const probe = options?.probeBinary ?? probeBinaryOnPath;
  const ffmpegConfigured = readTrimmed(env.HAMMER_FFMPEG_BIN);
  const ffprobeConfigured = readTrimmed(env.HAMMER_FFPROBE_BIN);
  const ffmpeg = resolveBinary({
    configuredValue: ffmpegConfigured,
    fallbackCommand: "ffmpeg",
    probe,
  });
  const ffprobe = resolveBinary({
    configuredValue: ffprobeConfigured,
    fallbackCommand: "ffprobe",
    probe,
  });

  return buildHammerMediaBackboneRuntimeSummary({
    preferredBackend: readBackendPreference(env.HAMMER_MEDIA_BACKEND),
    ffmpegBin: ffmpeg.bin,
    ffprobeBin: ffprobe.bin,
    ffmpegAvailable: ffmpeg.available,
    ffprobeAvailable: ffprobe.available,
  });
}
