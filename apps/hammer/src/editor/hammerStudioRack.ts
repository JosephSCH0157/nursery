import type { HammerVoicePolishState } from "./hammerVoicePolish";
import { createDefaultHammerVoicePolishState } from "./hammerVoicePolish";

export interface HammerStudioGateState {
  is_enabled: boolean;
  is_bypassed: boolean;
  threshold_db: number;
  range_db: number;
  attack_ms: number;
  release_ms: number;
}

export interface HammerStudioCompressorState {
  is_enabled: boolean;
  is_bypassed: boolean;
  threshold_db: number;
  ratio: number;
  attack_ms: number;
  release_ms: number;
  makeup_gain_db: number;
}

export interface HammerStudioEqState {
  is_enabled: boolean;
  is_bypassed: boolean;
  low_shelf_hz: number;
  low_shelf_gain_db: number;
  mid_hz: number;
  mid_gain_db: number;
  mid_q: number;
  high_shelf_hz: number;
  high_shelf_gain_db: number;
}

export interface HammerStudioReverbState {
  is_enabled: boolean;
  is_bypassed: boolean;
  mix: number;
  decay_sec: number;
  predelay_ms: number;
}

export interface HammerStudioTubeMicCharacterState {
  is_enabled: boolean;
  is_bypassed: boolean;
  amount: number;
  air: number;
  warmth: number;
}

export interface HammerStudioRackState {
  is_enabled: boolean;
  is_bypassed: boolean;
  backend_preference: "native" | "ffmpeg";
  voice_polish?: HammerVoicePolishState;
  modules: {
    gate: HammerStudioGateState;
    compressor: HammerStudioCompressorState;
    eq: HammerStudioEqState;
    reverb: HammerStudioReverbState;
    tubeMicCharacter: HammerStudioTubeMicCharacterState;
  };
}

export const HAMMER_STUDIO_RACK_MODULE_ORDER = [
  "gate",
  "compressor",
  "eq",
  "reverb",
  "tubeMicCharacter",
] as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function createDefaultHammerStudioRackState(): HammerStudioRackState {
  return {
    is_enabled: false,
    is_bypassed: false,
    backend_preference: "native",
    voice_polish: createDefaultHammerVoicePolishState(),
    modules: {
      gate: {
        is_enabled: false,
        is_bypassed: false,
        threshold_db: -52,
        range_db: -10,
        attack_ms: 12,
        release_ms: 220,
      },
      compressor: {
        is_enabled: false,
        is_bypassed: false,
        threshold_db: -24,
        ratio: 1.8,
        attack_ms: 24,
        release_ms: 220,
        makeup_gain_db: 1,
      },
      eq: {
        is_enabled: false,
        is_bypassed: false,
        low_shelf_hz: 120,
        low_shelf_gain_db: -1.5,
        mid_hz: 3200,
        mid_gain_db: 1.2,
        mid_q: 1.05,
        high_shelf_hz: 9800,
        high_shelf_gain_db: 1.5,
      },
      reverb: {
        is_enabled: false,
        is_bypassed: false,
        mix: 0.06,
        decay_sec: 0.55,
        predelay_ms: 12,
      },
      tubeMicCharacter: {
        is_enabled: false,
        is_bypassed: false,
        amount: 0.16,
        air: 0.2,
        warmth: 0.24,
      },
    },
  };
}

export function cloneHammerStudioRackState(state: HammerStudioRackState): HammerStudioRackState {
  return {
    is_enabled: state.is_enabled,
    is_bypassed: state.is_bypassed,
    backend_preference: state.backend_preference,
    voice_polish: state.voice_polish ? {
      preset_id: state.voice_polish.preset_id ?? null,
      voice_cleanup_enabled: state.voice_polish.voice_cleanup_enabled === true,
      fixes: { ...state.voice_polish.fixes },
      advanced: { ...state.voice_polish.advanced },
    } : undefined,
    modules: {
      gate: { ...state.modules.gate },
      compressor: { ...state.modules.compressor },
      eq: { ...state.modules.eq },
      reverb: { ...state.modules.reverb },
      tubeMicCharacter: { ...state.modules.tubeMicCharacter },
    },
  };
}

export function normalizeHammerStudioRackState(value: unknown): HammerStudioRackState {
  const defaults = createDefaultHammerStudioRackState();
  const row = readObject(value);
  if (!row) return defaults;

  const modules = readObject(row.modules);
  const gate = readObject(modules?.gate);
  const compressor = readObject(modules?.compressor);
  const eq = readObject(modules?.eq);
  const reverb = readObject(modules?.reverb);
  const tubeMicCharacter = readObject(modules?.tubeMicCharacter);
  const voicePolishRaw = readObject(row.voice_polish);

  const voice_polish: HammerVoicePolishState = voicePolishRaw
    ? {
      preset_id: voicePolishRaw.preset_id === "podcast_voice_balanced"
        || voicePolishRaw.preset_id === "clean_bright"
        || voicePolishRaw.preset_id === "warm_full"
        || voicePolishRaw.preset_id === "broadcast_ready"
        ? voicePolishRaw.preset_id
        : null,
      voice_cleanup_enabled: readBoolean(voicePolishRaw.voice_cleanup_enabled, defaults.voice_polish!.voice_cleanup_enabled),
      fixes: {
        remove_harsh_sibilance: readBoolean(readObject(voicePolishRaw.fixes)?.remove_harsh_sibilance, defaults.voice_polish!.fixes.remove_harsh_sibilance),
        reduce_room_boxiness: readBoolean(readObject(voicePolishRaw.fixes)?.reduce_room_boxiness, defaults.voice_polish!.fixes.reduce_room_boxiness),
        enhance_voice_clarity: readBoolean(readObject(voicePolishRaw.fixes)?.enhance_voice_clarity, defaults.voice_polish!.fixes.enhance_voice_clarity),
        level_volume: readBoolean(readObject(voicePolishRaw.fixes)?.level_volume, defaults.voice_polish!.fixes.level_volume),
      },
      advanced: {
        de_esser_strength: readObject(voicePolishRaw.advanced)?.de_esser_strength === "low"
          || readObject(voicePolishRaw.advanced)?.de_esser_strength === "medium"
          || readObject(voicePolishRaw.advanced)?.de_esser_strength === "high"
          ? readObject(voicePolishRaw.advanced)!.de_esser_strength as HammerVoicePolishState["advanced"]["de_esser_strength"]
          : defaults.voice_polish!.advanced.de_esser_strength,
        eq_profile: readObject(voicePolishRaw.advanced)?.eq_profile === "flat"
          || readObject(voicePolishRaw.advanced)?.eq_profile === "voice"
          || readObject(voicePolishRaw.advanced)?.eq_profile === "bright"
          ? readObject(voicePolishRaw.advanced)!.eq_profile as HammerVoicePolishState["advanced"]["eq_profile"]
          : defaults.voice_polish!.advanced.eq_profile,
      },
    }
    : defaults.voice_polish!;

  return {
    is_enabled: readBoolean(row.is_enabled, defaults.is_enabled),
    is_bypassed: readBoolean(row.is_bypassed, defaults.is_bypassed),
    backend_preference: row.backend_preference === "ffmpeg" ? "ffmpeg" : "native",
    voice_polish,
    modules: {
      gate: {
        is_enabled: readBoolean(gate?.is_enabled, defaults.modules.gate.is_enabled),
        is_bypassed: readBoolean(gate?.is_bypassed, defaults.modules.gate.is_bypassed),
        threshold_db: readNumber(gate?.threshold_db, defaults.modules.gate.threshold_db, -80, 0),
        range_db: readNumber(gate?.range_db, defaults.modules.gate.range_db, -60, 0),
        attack_ms: readNumber(gate?.attack_ms, defaults.modules.gate.attack_ms, 0.5, 120),
        release_ms: readNumber(gate?.release_ms, defaults.modules.gate.release_ms, 10, 1200),
      },
      compressor: {
        is_enabled: readBoolean(compressor?.is_enabled, defaults.modules.compressor.is_enabled),
        is_bypassed: readBoolean(compressor?.is_bypassed, defaults.modules.compressor.is_bypassed),
        threshold_db: readNumber(compressor?.threshold_db, defaults.modules.compressor.threshold_db, -60, 0),
        ratio: readNumber(compressor?.ratio, defaults.modules.compressor.ratio, 1, 20),
        attack_ms: readNumber(compressor?.attack_ms, defaults.modules.compressor.attack_ms, 0.5, 120),
        release_ms: readNumber(compressor?.release_ms, defaults.modules.compressor.release_ms, 10, 1200),
        makeup_gain_db: readNumber(compressor?.makeup_gain_db, defaults.modules.compressor.makeup_gain_db, -12, 18),
      },
      eq: {
        is_enabled: readBoolean(eq?.is_enabled, defaults.modules.eq.is_enabled),
        is_bypassed: readBoolean(eq?.is_bypassed, defaults.modules.eq.is_bypassed),
        low_shelf_hz: readNumber(eq?.low_shelf_hz, defaults.modules.eq.low_shelf_hz, 40, 400),
        low_shelf_gain_db: readNumber(eq?.low_shelf_gain_db, defaults.modules.eq.low_shelf_gain_db, -12, 12),
        mid_hz: readNumber(eq?.mid_hz, defaults.modules.eq.mid_hz, 200, 8000),
        mid_gain_db: readNumber(eq?.mid_gain_db, defaults.modules.eq.mid_gain_db, -12, 12),
        mid_q: readNumber(eq?.mid_q, defaults.modules.eq.mid_q, 0.2, 8),
        high_shelf_hz: readNumber(eq?.high_shelf_hz, defaults.modules.eq.high_shelf_hz, 2000, 16000),
        high_shelf_gain_db: readNumber(eq?.high_shelf_gain_db, defaults.modules.eq.high_shelf_gain_db, -12, 12),
      },
      reverb: {
        is_enabled: readBoolean(reverb?.is_enabled, defaults.modules.reverb.is_enabled),
        is_bypassed: readBoolean(reverb?.is_bypassed, defaults.modules.reverb.is_bypassed),
        mix: readNumber(reverb?.mix, defaults.modules.reverb.mix, 0, 0.35),
        decay_sec: readNumber(reverb?.decay_sec, defaults.modules.reverb.decay_sec, 0.1, 3.2),
        predelay_ms: readNumber(reverb?.predelay_ms, defaults.modules.reverb.predelay_ms, 0, 140),
      },
      tubeMicCharacter: {
        is_enabled: readBoolean(tubeMicCharacter?.is_enabled, defaults.modules.tubeMicCharacter.is_enabled),
        is_bypassed: readBoolean(tubeMicCharacter?.is_bypassed, defaults.modules.tubeMicCharacter.is_bypassed),
        amount: readNumber(tubeMicCharacter?.amount, defaults.modules.tubeMicCharacter.amount, 0, 1),
        air: readNumber(tubeMicCharacter?.air, defaults.modules.tubeMicCharacter.air, -1, 1),
        warmth: readNumber(tubeMicCharacter?.warmth, defaults.modules.tubeMicCharacter.warmth, -1, 1),
      },
    },
  };
}

export function isHammerStudioRackIdentity(state: HammerStudioRackState): boolean {
  if (!state.is_enabled || state.is_bypassed) return true;
  if (state.voice_polish?.voice_cleanup_enabled) {
    return false;
  }
  if (state.voice_polish && Object.values(state.voice_polish.fixes).some(Boolean)) {
    return false;
  }
  return HAMMER_STUDIO_RACK_MODULE_ORDER.every((moduleId) => {
    const module = state.modules[moduleId];
    return !module.is_enabled || module.is_bypassed;
  });
}
