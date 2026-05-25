import {
  ASR4_MARKER_POCKET_STATE,
  type Asr4MarkerPocketInput,
  type Asr4MarkerPocketState,
} from './asr4-authority.types';

function finiteLineOrSentinel(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return -1;
  return Math.max(1, Math.floor(Number(value)));
}

export function evaluateAsr4MarkerPocket(input: Asr4MarkerPocketInput): Asr4MarkerPocketState {
  const markerViewportLine = finiteLineOrSentinel(input.markerViewportLine);
  const readViewportLine = finiteLineOrSentinel(input.readViewportLine);

  if (markerViewportLine < 1 || readViewportLine < 1) {
    return {
      tag: ASR4_MARKER_POCKET_STATE,
      lane: 'marker_pocket',
      pocketState: 'unknown',
      markerViewportLine,
      readViewportLine,
      distanceFromMarkerLines: null,
      pocketTopLine: null,
      pocketBottomLine: null,
      reason: 'marker_or_read_line_unavailable',
    };
  }

  const pocketTopLine = Math.max(1, markerViewportLine - 4);
  const pocketBottomLine = markerViewportLine + 4;
  const distanceFromMarkerLines = readViewportLine - markerViewportLine;
  const absDistance = Math.abs(distanceFromMarkerLines);

  let pocketState: Asr4MarkerPocketState['pocketState'];
  let reason: string;

  if (absDistance < 4) {
    pocketState = 'safe';
    reason = 'inside_marker_centered_pocket';
  } else if (absDistance === 4) {
    pocketState = 'near_rail';
    reason = 'touching_marker_pocket_rail';
  } else if (distanceFromMarkerLines > 4) {
    pocketState = 'bottom_lock';
    reason = 'below_marker_pocket';
  } else {
    pocketState = 'near_rail';
    reason = 'above_marker_pocket';
  }

  return {
    tag: ASR4_MARKER_POCKET_STATE,
    lane: 'marker_pocket',
    pocketState,
    markerViewportLine,
    readViewportLine,
    distanceFromMarkerLines,
    pocketTopLine,
    pocketBottomLine,
    reason,
  };
}

export function buildAsr4MarkerPocketDiagnostic(state: Asr4MarkerPocketState): string {
  return `[${state.tag}] pocketState=${state.pocketState} markerViewportLine=${state.markerViewportLine} readViewportLine=${state.readViewportLine} distanceFromMarkerLines=${state.distanceFromMarkerLines ?? -1} pocketTopLine=${state.pocketTopLine ?? -1} pocketBottomLine=${state.pocketBottomLine ?? -1} reason=${state.reason}`;
}

