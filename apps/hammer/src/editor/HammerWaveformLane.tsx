import { useEffect, useRef, useMemo } from "react";
import type { JSX, MouseEvent as ReactMouseEvent } from "react";

export function resolveWaveformSeekTime(args: {
  clientX: number;
  laneLeftPx: number;
  laneScrollLeftPx: number;
  canvasWidthPx: number;
  durationSec: number;
}): number | null {
  if (!Number.isFinite(args.durationSec) || args.durationSec <= 0) return null;
  if (!Number.isFinite(args.canvasWidthPx) || args.canvasWidthPx <= 0) return null;

  const localX = args.clientX - args.laneLeftPx + args.laneScrollLeftPx;
  if (!Number.isFinite(localX)) return null;
  const ratio = Math.max(0, Math.min(1, localX / args.canvasWidthPx));
  return ratio * args.durationSec;
}

export interface HammerWaveformLaneProps {
  /**
   * Waveform proxy from canonical audio polish analysis.
   * Null if waveform is not available.
   */
  waveformProxy: {
    version: "v1";
    duration_sec: number;
    bucket_count: number;
    bucket_duration_sec: number;
    channel_mode: "mono_mixdown";
    peaks: number[];
  } | null;

  /**
   * Current playhead position in seconds.
   * Used to render playhead indicator on waveform.
   */
  playheadSec?: number;

  /**
   * Optional seek seam.
   * If provided, clicking the lane requests a seek on the canonical transport path.
   */
  onSeekRequest?: (targetSec: number) => void;

  /**
   * CSS class to apply to the container.
   */
  className?: string;
}

/**
 * Renders a minimal, truthful waveform visualization.
 *
 * Design:
 * - Canvas-based for performance with many buckets (up to 2400)
 * - One vertical bar per bucket
 * - Height represents magnitude (0–1 normalized from proxy)
 * - Playhead indicator (thin line) shows current position
 * - Null state: shows nothing (plausible "no waveform" behavior)
 *
 * Restraint:
 * - No zoom, no scrub, no edit
 * - No interactive features
 * - Visually calm dark theme
 * - Deterministic rendering from proxy shape
 */
export function HammerWaveformLane(props: HammerWaveformLaneProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleLaneClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (!props.waveformProxy || !canvasDims || !props.onSeekRequest) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const targetSec = resolveWaveformSeekTime({
      clientX: event.clientX,
      laneLeftPx: rect.left,
      laneScrollLeftPx: event.currentTarget.scrollLeft,
      canvasWidthPx: canvasDims.canvasWidth,
      durationSec: props.waveformProxy.duration_sec,
    });
    if (targetSec == null) return;
    props.onSeekRequest(targetSec);
  };

  /**
   * Compute canvas dimensions and scaling factors.
   */
  const canvasDims = useMemo(() => {
    if (!props.waveformProxy) return null;

    const bucketCount = props.waveformProxy.bucket_count;
    const durationSec = props.waveformProxy.duration_sec;

    // Canvas height: 80px for waveform visualization (restrained)
    const canvasHeight = 80;

    // Canvas width: at least 256px, up to one pixel per bucket (capped)
    // For 2400 buckets, this would be 2400px (scrollable container will handle overflow)
    const minimumCanvasWidth = 256;
    const pxPerBucket = Math.max(1, 2400 / bucketCount); // Scale down for dense waveforms
    const computedWidth = Math.max(minimumCanvasWidth, bucketCount * pxPerBucket);

    return {
      canvasHeight,
      canvasWidth: computedWidth,
      pxPerBucket,
      pxPerSec: computedWidth / durationSec,
    };
  }, [props.waveformProxy]);

  /**
   * Render the waveform on canvas.
   * Called whenever props or canvas dims change.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasDims || !props.waveformProxy) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { canvasHeight, canvasWidth, pxPerBucket } = canvasDims;
    const { peaks, bucket_count: bucketCount } = props.waveformProxy;

    // Clear canvas
    ctx.fillStyle = "rgba(2, 6, 23, 0.5)"; // Very dark blue, slightly transparent
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw waveform bars
    // For each bucket, draw a vertical bar with height proportional to peak magnitude
    const barWidth = Math.max(1, Math.floor(pxPerBucket * 0.9)); // Leave small gap between bars
    const centerY = canvasHeight / 2;

    for (let i = 0; i < bucketCount && i < peaks.length; i += 1) {
      const peak = Math.max(0, Math.min(1, peaks[i] ?? 0)); // Clamp to [0,1]
      const barHeight = peak * centerY; // Peak magnitude controls bar height

      const x = i * pxPerBucket;
      const y = centerY - barHeight / 2;

      // Color: brighter blue/cyan for higher peaks
      // Silent regions: very dim (near-zero peaks)
      // Signal regions: more visible cyan
      const saturation = Math.min(100, 40 + peak * 60); // 40–100%
      ctx.fillStyle = `hsl(200, ${saturation}%, ${Math.max(15, 25 + peak * 50)}%)`;

      ctx.fillRect(x, y, barWidth, barHeight);
    }

    // Draw playhead indicator if position is provided
    if (props.playheadSec !== undefined && canvasDims) {
      const playheadX = props.playheadSec * canvasDims.pxPerSec;
      if (playheadX >= 0 && playheadX <= canvasWidth) {
        ctx.strokeStyle = "rgba(96, 165, 250, 0.8)"; // Bright blue
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, canvasHeight);
        ctx.stroke();
      }
    }
  }, [props.waveformProxy, props.playheadSec, canvasDims]);

  // If no waveform, render nothing (true null state)
  if (!props.waveformProxy || !canvasDims) {
    return (
      <div className={`hammer-waveform-lane hammer-waveform-lane--unavailable ${props.className ?? ""}`}>
        {/* Empty: no waveform available */}
      </div>
    );
  }

  return (
    <div
      className={`hammer-waveform-lane${props.onSeekRequest ? " is-seekable" : ""} ${props.className ?? ""}`}
      onClick={props.onSeekRequest ? handleLaneClick : undefined}
      role={props.onSeekRequest ? "button" : undefined}
      aria-label={props.onSeekRequest ? "Waveform seek lane" : undefined}
      tabIndex={props.onSeekRequest ? 0 : undefined}
    >
      <canvas
        ref={canvasRef}
        width={canvasDims.canvasWidth}
        height={canvasDims.canvasHeight}
        className="hammer-waveform-lane__canvas"
      />
    </div>
  );
}
