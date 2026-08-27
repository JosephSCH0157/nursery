import type { HammerVisualClip } from "../visuals/model/hammerVisualTypes";

export type HammerPackagingPhase = "intro" | "composition" | "outro" | "complete";

export type HammerPackagingTransport = {
  introDurationSec: number;
  outroDurationSec: number;
  compositionOffsetSec: number;
  compositionDurationSec: number;
  programEndTransportSec: number;
  outroStartTransportSec: number;
  totalDurationSec: number;
  phase: HammerPackagingPhase;
  compositionPlayheadSec: number;
  phasePlayheadSec: number;
};

function clampTimeSec(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 1000) / 1000);
}

export function isIntroOutroPackagingClip(clip: HammerVisualClip): boolean {
  return clip.system_type === "intro" || clip.system_type === "outro";
}

export function resolvePackagingClipDurationSec(clip: HammerVisualClip | null | undefined): number {
  if (!clip) return 0;
  return clampTimeSec(Math.max(0, clip.end_sec - clip.start_sec));
}

export function resolvePackagingTransport(args: {
  introDurationSec: number;
  outroDurationSec: number;
  compositionDurationSec: number;
  playheadSec: number;
}): HammerPackagingTransport {
  const introDurationSec = clampTimeSec(args.introDurationSec);
  const outroDurationSec = clampTimeSec(args.outroDurationSec);
  const compositionDurationSec = clampTimeSec(args.compositionDurationSec);
  const totalDurationSec = clampTimeSec(introDurationSec + compositionDurationSec + outroDurationSec);
  const clampedPlayheadSec = Math.max(0, Math.min(totalDurationSec, args.playheadSec));
  const compositionOffsetSec = introDurationSec;
  const programEndTransportSec = compositionOffsetSec + compositionDurationSec;

  if (clampedPlayheadSec >= totalDurationSec) {
    return {
      introDurationSec,
      outroDurationSec,
      compositionOffsetSec,
      compositionDurationSec,
      programEndTransportSec,
      outroStartTransportSec: programEndTransportSec,
      totalDurationSec,
      phase: "complete",
      compositionPlayheadSec: compositionDurationSec,
      phasePlayheadSec: outroDurationSec,
    };
  }

  if (introDurationSec > 0 && clampedPlayheadSec < compositionOffsetSec) {
    return {
      introDurationSec,
      outroDurationSec,
      compositionOffsetSec,
      compositionDurationSec,
      programEndTransportSec,
      outroStartTransportSec: programEndTransportSec,
      totalDurationSec,
      phase: "intro",
      compositionPlayheadSec: 0,
      phasePlayheadSec: clampedPlayheadSec,
    };
  }

  if (outroDurationSec > 0 && clampedPlayheadSec >= programEndTransportSec) {
    return {
      introDurationSec,
      outroDurationSec,
      compositionOffsetSec,
      compositionDurationSec,
      programEndTransportSec,
      outroStartTransportSec: programEndTransportSec,
      totalDurationSec,
      phase: "outro",
      compositionPlayheadSec: compositionDurationSec,
      phasePlayheadSec: clampedPlayheadSec - programEndTransportSec,
    };
  }

  return {
    introDurationSec,
    outroDurationSec,
    compositionOffsetSec,
    compositionDurationSec,
    programEndTransportSec,
    outroStartTransportSec: programEndTransportSec,
    totalDurationSec,
    phase: "composition",
    compositionPlayheadSec: Math.max(0, Math.min(compositionDurationSec, clampedPlayheadSec - compositionOffsetSec)),
    phasePlayheadSec: Math.max(0, Math.min(compositionDurationSec, clampedPlayheadSec - compositionOffsetSec)),
  };
}

export function compositionTimeToTransportTime(timeSec: number, compositionOffsetSec: number): number {
  return clampTimeSec(Math.max(0, timeSec) + Math.max(0, compositionOffsetSec));
}

export function transportTimeToCompositionTime(args: {
  timeSec: number;
  compositionOffsetSec: number;
  compositionDurationSec: number;
}): number {
  return clampTimeSec(Math.max(0, Math.min(args.compositionDurationSec, args.timeSec - args.compositionOffsetSec)));
}

export function shiftCompositionWindowToTransport(args: {
  startSec: number;
  endSec: number;
  compositionOffsetSec: number;
}): { startSec: number; endSec: number } {
  return {
    startSec: compositionTimeToTransportTime(args.startSec, args.compositionOffsetSec),
    endSec: compositionTimeToTransportTime(args.endSec, args.compositionOffsetSec),
  };
}

export function transportTimeToActiveMediaTime(args: {
  transport: HammerPackagingTransport;
  timeSec: number;
}): number {
  const timeSec = clampTimeSec(args.timeSec);
  if (args.transport.phase === "intro") {
    return Math.max(0, Math.min(args.transport.introDurationSec, timeSec));
  }
  if (args.transport.phase === "outro") {
    return Math.max(0, Math.min(args.transport.outroDurationSec, timeSec - args.transport.outroStartTransportSec));
  }
  if (args.transport.phase === "complete") return args.transport.outroDurationSec;
  return transportTimeToCompositionTime({
    timeSec,
    compositionOffsetSec: args.transport.compositionOffsetSec,
    compositionDurationSec: args.transport.compositionDurationSec,
  });
}

export function activeMediaTimeToTransportTime(args: {
  transport: HammerPackagingTransport;
  timeSec: number;
}): number {
  const timeSec = clampTimeSec(args.timeSec);
  if (args.transport.phase === "intro") {
    return Math.max(0, Math.min(args.transport.introDurationSec, timeSec));
  }
  if (args.transport.phase === "outro") {
    return clampTimeSec(
      args.transport.outroStartTransportSec + Math.max(0, Math.min(args.transport.outroDurationSec, timeSec)),
    );
  }
  if (args.transport.phase === "complete") return args.transport.totalDurationSec;
  return compositionTimeToTransportTime(timeSec, args.transport.compositionOffsetSec);
}
