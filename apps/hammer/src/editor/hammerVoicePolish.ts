export type HammerVoicePolishFixId =
  | "remove_harsh_sibilance"
  | "reduce_room_boxiness"
  | "enhance_voice_clarity"
  | "level_volume";

export type HammerVoicePolishPresetId =
  | "podcast_voice_balanced"
  | "clean_bright"
  | "warm_full"
  | "broadcast_ready";

export type HammerVoicePolishDeEsserStrength = "low" | "medium" | "high";
export type HammerVoicePolishEqProfile = "flat" | "voice" | "bright";

export type HammerVoicePolishFixState = Record<HammerVoicePolishFixId, boolean>;

export interface HammerVoicePolishState {
  preset_id: HammerVoicePolishPresetId | null;
  fixes: HammerVoicePolishFixState;
  advanced: {
    de_esser_strength: HammerVoicePolishDeEsserStrength;
    eq_profile: HammerVoicePolishEqProfile;
  };
}

export function createDefaultHammerVoicePolishState(): HammerVoicePolishState {
  return {
    preset_id: null,
    fixes: {
      remove_harsh_sibilance: false,
      reduce_room_boxiness: false,
      enhance_voice_clarity: false,
      level_volume: false,
    },
    advanced: {
      de_esser_strength: "medium",
      eq_profile: "voice",
    },
  };
}

export const HAMMER_VOICE_POLISH_PRESETS: Array<{
  id: HammerVoicePolishPresetId;
  fixes: HammerVoicePolishFixState;
}> = [
  {
    id: "podcast_voice_balanced",
    fixes: {
      remove_harsh_sibilance: true,
      reduce_room_boxiness: true,
      enhance_voice_clarity: true,
      level_volume: true,
    },
  },
  {
    id: "clean_bright",
    fixes: {
      remove_harsh_sibilance: true,
      reduce_room_boxiness: false,
      enhance_voice_clarity: true,
      level_volume: true,
    },
  },
  {
    id: "warm_full",
    fixes: {
      remove_harsh_sibilance: false,
      reduce_room_boxiness: true,
      enhance_voice_clarity: false,
      level_volume: true,
    },
  },
  {
    id: "broadcast_ready",
    fixes: {
      remove_harsh_sibilance: true,
      reduce_room_boxiness: true,
      enhance_voice_clarity: true,
      level_volume: true,
    },
  },
];

export function resolveHammerVoicePolishPreset(id: HammerVoicePolishPresetId): HammerVoicePolishFixState {
  const preset = HAMMER_VOICE_POLISH_PRESETS.find((row) => row.id === id);
  return preset ? preset.fixes : createDefaultHammerVoicePolishState().fixes;
}

export function applyHammerVoicePolishPreset(
  current: HammerVoicePolishState,
  presetId: HammerVoicePolishPresetId,
): HammerVoicePolishState {
  return {
    ...current,
    preset_id: presetId,
    fixes: { ...resolveHammerVoicePolishPreset(presetId) },
  };
}

export function setHammerVoicePolishFixEnabled(
  current: HammerVoicePolishState,
  fixId: HammerVoicePolishFixId,
  enabled: boolean,
): HammerVoicePolishState {
  return {
    ...current,
    preset_id: null,
    fixes: {
      ...current.fixes,
      [fixId]: enabled,
    },
  };
}

export function setHammerVoicePolishDeEsserStrength(
  current: HammerVoicePolishState,
  strength: HammerVoicePolishDeEsserStrength,
): HammerVoicePolishState {
  return {
    ...current,
    preset_id: current.preset_id,
    advanced: {
      ...current.advanced,
      de_esser_strength: strength,
    },
  };
}

export function setHammerVoicePolishEqProfile(
  current: HammerVoicePolishState,
  profile: HammerVoicePolishEqProfile,
): HammerVoicePolishState {
  return {
    ...current,
    preset_id: current.preset_id,
    advanced: {
      ...current.advanced,
      eq_profile: profile,
    },
  };
}

type DeEsserParams = { intensity: number; max: number; frequency: number };

function resolveDeEsserParams(
  strength: HammerVoicePolishDeEsserStrength,
  presetId: HammerVoicePolishPresetId | null,
): DeEsserParams {
  const base = strength === "high"
    ? { intensity: 0.55, max: 0.65, frequency: 0.58 }
    : strength === "low"
    ? { intensity: 0.22, max: 0.35, frequency: 0.56 }
    : { intensity: 0.38, max: 0.5, frequency: 0.57 };

  if (presetId === "broadcast_ready") {
    return {
      intensity: Math.min(1, base.intensity + 0.06),
      max: Math.min(1, base.max + 0.05),
      frequency: base.frequency,
    };
  }
  if (presetId === "clean_bright") {
    return {
      intensity: Math.min(1, base.intensity + 0.04),
      max: Math.min(1, base.max + 0.04),
      frequency: base.frequency,
    };
  }
  return base;
}

export function buildHammerVoicePolishTier2FfmpegFilters(state: HammerVoicePolishState): string[] {
  const filters: string[] = [];

  const presetId = state.preset_id;
  const eqProfile = state.advanced.eq_profile;

  const hasAnyFix = Object.values(state.fixes).some(Boolean);
  if (!hasAnyFix) return filters;

  if (state.fixes.remove_harsh_sibilance) {
    const deesser = resolveDeEsserParams(state.advanced.de_esser_strength, presetId);
    filters.push(`deesser=i=${deesser.intensity.toFixed(2)}:m=${deesser.max.toFixed(2)}:f=${deesser.frequency.toFixed(2)}:s=o`);
    filters.push("equalizer=f=6500:t=q:w=1.20:g=-1.2");
  }

  if (state.fixes.reduce_room_boxiness) {
    const gain = presetId === "broadcast_ready"
      ? -3.2
      : presetId === "warm_full"
      ? -2.4
      : -2.7;
    filters.push(`equalizer=f=320:t=q:w=1.10:g=${gain.toFixed(1)}`);
  }

  if (state.fixes.enhance_voice_clarity) {
    const base = presetId === "broadcast_ready"
      ? 2.6
      : presetId === "clean_bright"
      ? 2.9
      : 2.2;
    const profileBoost = eqProfile === "bright" ? 0.5 : eqProfile === "flat" ? -0.3 : 0;
    const gain = Math.max(0.8, base + profileBoost);
    filters.push(`equalizer=f=3000:t=q:w=1.00:g=${gain.toFixed(1)}`);
    if (eqProfile === "bright" || presetId === "clean_bright") {
      filters.push("treble=f=8000:t=o:w=0.45:g=1.2");
    }
  }

  if (presetId === "warm_full") {
    filters.push("bass=f=140:t=o:w=0.60:g=1.3");
  }

  if (state.fixes.level_volume) {
    const compressor = presetId === "broadcast_ready"
      ? { threshold: 0.095, ratio: 2.6, attack: 8, release: 180, makeup: 1.18 }
      : { threshold: 0.11, ratio: 2.0, attack: 12, release: 220, makeup: 1.12 };
    filters.push(
      [
        "acompressor",
        `threshold=${compressor.threshold.toFixed(3)}`,
        `ratio=${compressor.ratio.toFixed(2)}`,
        `attack=${compressor.attack.toFixed(1)}`,
        `release=${compressor.release.toFixed(1)}`,
        `makeup=${compressor.makeup.toFixed(3)}`,
      ].join(":"),
    );
    const integrated = presetId === "broadcast_ready" ? -16 : -18;
    filters.push(`loudnorm=I=${integrated}:LRA=7:TP=-1.5:linear=true:dual_mono=false:print_format=none`);
  }

  return filters;
}

