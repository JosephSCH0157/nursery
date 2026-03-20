import { useEffect, useState } from "react";
import type { BellowsDeviceReadinessState } from "@forge/bellows";
import type {
  BellowsAudioActivityState,
  BellowsParticipantReadiness,
} from "./bellowsSessionPresence";

export type BellowsLocalMediaReadinessState = {
  readonly readiness: BellowsParticipantReadiness;
  readonly stream: MediaStream | null;
  readonly audioLevelPct: number;
  readonly audioActivity: BellowsAudioActivityState;
  readonly deviceMessage: string;
  readonly deviceError: string | null;
  readonly hasPreview: boolean;
};

type BellowsLocalMediaRequestState = {
  readonly readiness: BellowsParticipantReadiness;
  readonly stream: MediaStream | null;
  readonly deviceMessage: string;
  readonly deviceError: string | null;
};

function stopStream(stream: MediaStream | null): void {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
}

function combineStreams(args: {
  audioStream: MediaStream | null;
  videoStream: MediaStream | null;
}): MediaStream | null {
  const tracks = [
    ...(args.audioStream?.getAudioTracks() ?? []),
    ...(args.videoStream?.getVideoTracks() ?? []),
  ];

  return tracks.length > 0 ? new MediaStream(tracks) : null;
}

function deriveOverallReadiness(args: {
  microphone: BellowsDeviceReadinessState;
  camera: BellowsDeviceReadinessState;
}): BellowsDeviceReadinessState {
  if (args.microphone === "blocked" || args.camera === "blocked") {
    return "blocked";
  }

  if (args.microphone === "ready" && args.camera === "ready") {
    return "ready";
  }

  if (args.microphone === "unknown" && args.camera === "unknown") {
    return "unknown";
  }

  return "pending";
}

function describeDeviceMessage(readiness: BellowsParticipantReadiness): string {
  if (readiness.overall === "ready") {
    return "Microphone and camera are ready for Bellows.";
  }

  if (readiness.microphone === "blocked" && readiness.camera === "blocked") {
    return "Bellows could not access microphone or camera.";
  }

  if (readiness.microphone === "blocked") {
    return "Bellows camera preview is live, but microphone access still needs attention.";
  }

  if (readiness.camera === "blocked") {
    return "Bellows microphone is live, but camera access still needs attention.";
  }

  if (readiness.microphone === "ready" || readiness.camera === "ready") {
    return "Bellows has partial device access and is still waiting on the remaining device.";
  }

  return "Bellows is checking local devices.";
}

async function requestLocalMedia(): Promise<{
  readiness: BellowsParticipantReadiness;
  stream: MediaStream | null;
  deviceError: string | null;
}> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      readiness: {
        microphone: "blocked",
        camera: "blocked",
        overall: "blocked",
      },
      stream: null,
      deviceError: "This browser cannot access microphone or camera APIs.",
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });

    return {
      readiness: {
        microphone: "ready",
        camera: "ready",
        overall: "ready",
      },
      stream,
      deviceError: null,
    };
  } catch (combinedError) {
    let audioStream: MediaStream | null = null;
    let videoStream: MediaStream | null = null;
    let microphone: BellowsDeviceReadinessState = "blocked";
    let camera: BellowsDeviceReadinessState = "blocked";

    try {
      audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphone = "ready";
    } catch {
      microphone = "blocked";
    }

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      camera = "ready";
    } catch {
      camera = "blocked";
    }

    const stream = combineStreams({
      audioStream,
      videoStream,
    });

    const readiness = {
      microphone,
      camera,
      overall: deriveOverallReadiness({ microphone, camera }),
    } satisfies BellowsParticipantReadiness;

    const errorMessage = combinedError instanceof Error && combinedError.message.trim()
      ? combinedError.message
      : "Bellows could not access local media devices.";

    return {
      readiness,
      stream,
      deviceError: readiness.overall === "ready" ? null : errorMessage,
    };
  }
}

export function useBellowsLocalMediaReadiness(
  enabled: boolean,
): BellowsLocalMediaReadinessState & {
  readonly retryToken: number;
  retry(): void;
} {
  const disabledRequestState: BellowsLocalMediaRequestState = {
    readiness: {
      microphone: "unknown",
      camera: "unknown",
      overall: "unknown",
    },
    stream: null,
    deviceMessage: "Bellows is waiting to check local devices.",
    deviceError: null,
  };
  const pendingRequestState: BellowsLocalMediaRequestState = {
    readiness: {
      microphone: "pending",
      camera: "pending",
      overall: "pending",
    },
    stream: null,
    deviceMessage: "Bellows is checking local devices.",
    deviceError: null,
  };
  const [retryToken, setRetryToken] = useState(0);
  const [requestState, setRequestState] = useState<BellowsLocalMediaRequestState>(
    enabled ? pendingRequestState : disabledRequestState,
  );
  const [audioSample, setAudioSample] = useState<{
    readonly audioLevelPct: number;
    readonly audioActivity: BellowsAudioActivityState;
  }>({
    audioLevelPct: 0,
    audioActivity: "unknown",
  });

  const effectiveRequestState = enabled
    ? (requestState.readiness.overall === "unknown" ? pendingRequestState : requestState)
    : disabledRequestState;
  const stream = effectiveRequestState.stream;
  const readiness = effectiveRequestState.readiness;
  const deviceMessage = effectiveRequestState.deviceMessage;
  const deviceError = effectiveRequestState.deviceError;
  const audioTracks = stream?.getAudioTracks() ?? [];
  const audioLevelPct = audioTracks.length > 0 ? audioSample.audioLevelPct : 0;
  const audioActivity = audioTracks.length > 0
    ? audioSample.audioActivity
    : readiness.microphone === "ready"
    ? "silent"
    : "unknown";

  useEffect(() => {
    if (!enabled) {
      setRequestState((current) => {
        stopStream(current);
        return disabledRequestState;
      });
      setAudioSample({
        audioLevelPct: 0,
        audioActivity: "unknown",
      });
      return;
    }

    let active = true;
    setAudioSample({
      audioLevelPct: 0,
      audioActivity: "unknown",
    });

    void requestLocalMedia()
      .then((result) => {
        if (!active) {
          stopStream(result.stream);
          return;
        }

        setRequestState((current) => {
          stopStream(current.stream);
          return {
            readiness: result.readiness,
            stream: result.stream,
            deviceMessage: describeDeviceMessage(result.readiness),
            deviceError: result.deviceError,
          };
        });
      })
      .catch((error) => {
        if (!active) return;
        const message = error instanceof Error && error.message.trim()
          ? error.message
          : "Bellows could not access local media devices.";
        setRequestState((current) => {
          stopStream(current.stream);
          return {
            readiness: {
              microphone: "blocked",
              camera: "blocked",
              overall: "blocked",
            },
            stream: null,
            deviceMessage: "Bellows could not get microphone or camera ready.",
            deviceError: message,
          };
        });
      });

    return () => {
      active = false;
    };
  }, [enabled, retryToken]);

  useEffect(() => {
    if (audioTracks.length === 0) {
      return;
    }

    const AudioContextCtor = window.AudioContext
      || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    let active = true;
    let frameId = 0;
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    const tick = () => {
      if (!active) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      const nextLevel = Math.max(0, Math.min(100, Math.round(rms * 220)));
      setAudioSample({
        audioLevelPct: nextLevel,
        audioActivity: nextLevel >= 8 ? "active" : "silent",
      });
      frameId = window.requestAnimationFrame(tick);
    };

    void audioContext.resume().catch(() => {
      // ignore resume failures and still attempt level polling
    });
    frameId = window.requestAnimationFrame(tick);

    return () => {
      active = false;
      window.cancelAnimationFrame(frameId);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close().catch(() => {
        // ignore cleanup failures
      });
    };
  }, [readiness.microphone, stream]);

  useEffect(() => {
    return () => {
      stopStream(stream);
    };
  }, [stream]);

  return {
    readiness,
    stream,
    audioLevelPct,
    audioActivity,
    deviceMessage,
    deviceError,
    hasPreview: Boolean(stream?.getVideoTracks().length),
    retryToken,
    retry() {
      setRetryToken((value) => value + 1);
    },
  };
}
