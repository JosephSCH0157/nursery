const DRAWER_KEY = 'tp_dev_drawer_open';
const ZEN_KEY = 'tp_dev_zen';
const ASR_EXPERIMENTAL_LANE_KEY = 'tp_asr_experimental_lane_v1';

export const ASR_LANE_ASR1 = 'ASR1_CURRENT';
export const ASR_LANE_ASR2 = 'ASR2_WHISPER_LARGE_V3_EXPERIMENTAL';
export type AsrExperimentalLane = typeof ASR_LANE_ASR1 | typeof ASR_LANE_ASR2;

function readFlag(key: string, defaultValue = false): boolean {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const raw = window.localStorage?.getItem(key);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // ignore storage errors
  }
  return defaultValue;
}

function writeFlag(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(key, value ? '1' : '0');
  } catch {
    // ignore storage errors
  }
}

export function getDevDrawerOpen(): boolean {
  return readFlag(DRAWER_KEY, false);
}

export function setDevDrawerOpen(value: boolean): void {
  writeFlag(DRAWER_KEY, value);
}

export function getDevZen(): boolean {
  return readFlag(ZEN_KEY, false);
}

export function setDevZen(value: boolean): void {
  writeFlag(ZEN_KEY, value);
}

export function getAsrExperimentalLane(): AsrExperimentalLane {
  if (typeof window === 'undefined') return ASR_LANE_ASR1;
  try {
    const raw = String(window.localStorage?.getItem(ASR_EXPERIMENTAL_LANE_KEY) || '').trim().toUpperCase();
    if (raw === ASR_LANE_ASR2) return ASR_LANE_ASR2;
  } catch {
    // ignore storage errors
  }
  return ASR_LANE_ASR1;
}

export function setAsrExperimentalLane(value: string): AsrExperimentalLane {
  const lane = String(value || '').trim().toUpperCase() === ASR_LANE_ASR2
    ? ASR_LANE_ASR2
    : ASR_LANE_ASR1;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage?.setItem(ASR_EXPERIMENTAL_LANE_KEY, lane);
    } catch {
      // ignore storage errors
    }
  }
  return lane;
}
