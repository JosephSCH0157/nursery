export type RecordingCaptureMode = "av" | "audio";

export type RecordingCaptureMechanism = "media-recorder" | "pcm-wav-fallback";

export type RecordingCaptureStrategy = {
  mode: RecordingCaptureMode;
  mechanism: RecordingCaptureMechanism;
  mimeType: string;
  fileExtension: string;
  recordingMedium: string;
  requiresPostNormalization: boolean;
  videoBitsPerSecond: number | null;
  audioBitsPerSecond: number | null;
  diagnostics: string[];
};

type MediaRecorderLike = {
  isTypeSupported?: (mimeType: string) => boolean;
};

const DEFAULT_VIDEO_BITS_PER_SECOND = 1_200_000;
const DEFAULT_AUDIO_BITS_PER_SECOND = 96_000;

function supportsMimeType(mediaRecorderCtor: MediaRecorderLike | undefined, mimeType: string): boolean {
  if (!mediaRecorderCtor || typeof mediaRecorderCtor.isTypeSupported !== "function") {
    return false;
  }
  try {
    return mediaRecorderCtor.isTypeSupported(mimeType);
  } catch {
    return false;
  }
}

export function selectBestRecordingStrategy(args: {
  mode: RecordingCaptureMode;
  mediaRecorderCtor?: MediaRecorderLike;
}): RecordingCaptureStrategy {
  const diagnostics: string[] = [];
  const mediaRecorderCtor = args.mediaRecorderCtor ?? (globalThis as typeof globalThis & { MediaRecorder?: MediaRecorderLike }).MediaRecorder;

  if (args.mode === "av") {
    const candidates = [
      {
        mimeType: "video/webm;codecs=vp9,opus",
        fileExtension: "webm",
        recordingMedium: "browser-mediarecorder:video/webm;codecs=vp9,opus",
      },
      {
        mimeType: "video/webm;codecs=vp8,opus",
        fileExtension: "webm",
        recordingMedium: "browser-mediarecorder:video/webm;codecs=vp8,opus",
      },
      {
        mimeType: "video/webm;codecs=h264,opus",
        fileExtension: "webm",
        recordingMedium: "browser-mediarecorder:video/webm;codecs=h264,opus",
      },
      {
        mimeType: "video/webm",
        fileExtension: "webm",
        recordingMedium: "browser-mediarecorder:video/webm",
      },
    ] as const;

    for (const candidate of candidates) {
      if (supportsMimeType(mediaRecorderCtor, candidate.mimeType)) {
        diagnostics.push(`selected:${candidate.mimeType}`);
        return {
          mode: "av",
          mechanism: "media-recorder",
          mimeType: candidate.mimeType,
          fileExtension: candidate.fileExtension,
          recordingMedium: candidate.recordingMedium,
          requiresPostNormalization: false,
          videoBitsPerSecond: DEFAULT_VIDEO_BITS_PER_SECOND,
          audioBitsPerSecond: DEFAULT_AUDIO_BITS_PER_SECOND,
          diagnostics,
        };
      }
      diagnostics.push(`unsupported:${candidate.mimeType}`);
    }

    diagnostics.push("fallback:video/webm");
    return {
      mode: "av",
      mechanism: "media-recorder",
      mimeType: "video/webm",
      fileExtension: "webm",
      recordingMedium: "browser-mediarecorder:video/webm",
      requiresPostNormalization: false,
      videoBitsPerSecond: DEFAULT_VIDEO_BITS_PER_SECOND,
      audioBitsPerSecond: DEFAULT_AUDIO_BITS_PER_SECOND,
      diagnostics,
    };
  }

  const audioCandidates = [
    {
      mimeType: "audio/webm;codecs=opus",
      fileExtension: "webm",
      recordingMedium: "browser-mediarecorder:audio/webm;codecs=opus",
    },
    {
      mimeType: "audio/ogg;codecs=opus",
      fileExtension: "ogg",
      recordingMedium: "browser-mediarecorder:audio/ogg;codecs=opus",
    },
    {
      mimeType: "audio/webm",
      fileExtension: "webm",
      recordingMedium: "browser-mediarecorder:audio/webm",
    },
  ] as const;

  for (const candidate of audioCandidates) {
    if (supportsMimeType(mediaRecorderCtor, candidate.mimeType)) {
      diagnostics.push(`selected:${candidate.mimeType}`);
      return {
        mode: "audio",
        mechanism: "media-recorder",
        mimeType: candidate.mimeType,
        fileExtension: candidate.fileExtension,
        recordingMedium: candidate.recordingMedium,
        requiresPostNormalization: false,
        videoBitsPerSecond: null,
        audioBitsPerSecond: DEFAULT_AUDIO_BITS_PER_SECOND,
        diagnostics,
      };
    }
    diagnostics.push(`unsupported:${candidate.mimeType}`);
  }

  diagnostics.push("fallback:audio/wav");
  return {
    mode: "audio",
    mechanism: "pcm-wav-fallback",
    mimeType: "audio/wav",
    fileExtension: "wav",
    recordingMedium: "browser-pcm-wav-fallback",
    requiresPostNormalization: false,
    videoBitsPerSecond: null,
    audioBitsPerSecond: null,
    diagnostics,
  };
}