import type { ComposeSetup, ProductionDefaults } from "../domain/compose";

const COMPOSE_DEFAULTS_KEY = "hearth:compose:defaults:v1";

const FALLBACK_DEFAULTS: ProductionDefaults = {
  defaultSpeakerCount: 2,
  defaultSpeakers: ["s1", "s2"],
  defaultMode: "outline_by_speaker",
  defaultTargetSpeaker: null,
  assumeStandardUnlessOverridden: true,
};

function isSpeaker(value: unknown): value is "s1" | "s2" | "g1" | "g2" {
  return value === "s1" || value === "s2" || value === "g1" || value === "g2";
}

export function readProductionDefaults(): ProductionDefaults {
  try {
    const raw = window.localStorage.getItem(COMPOSE_DEFAULTS_KEY);
    if (!raw) return FALLBACK_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<ProductionDefaults> | null;
    if (!parsed) return FALLBACK_DEFAULTS;
    const speakers = Array.isArray(parsed.defaultSpeakers)
      ? parsed.defaultSpeakers.filter((speaker): speaker is "s1" | "s2" | "g1" | "g2" => isSpeaker(speaker))
      : [];
    const defaultSpeakerCount = parsed.defaultSpeakerCount;
    if (!defaultSpeakerCount || defaultSpeakerCount < 1 || defaultSpeakerCount > 4) return FALLBACK_DEFAULTS;
    return {
      defaultSpeakerCount: defaultSpeakerCount as 1 | 2 | 3 | 4,
      defaultSpeakers: speakers.length > 0 ? speakers.slice(0, defaultSpeakerCount) : FALLBACK_DEFAULTS.defaultSpeakers,
      defaultMode: parsed.defaultMode ?? FALLBACK_DEFAULTS.defaultMode,
      defaultTargetSpeaker: isSpeaker(parsed.defaultTargetSpeaker) ? parsed.defaultTargetSpeaker : null,
      assumeStandardUnlessOverridden: parsed.assumeStandardUnlessOverridden !== false,
    };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export function writeProductionDefaults(defaults: ProductionDefaults): void {
  try {
    window.localStorage.setItem(COMPOSE_DEFAULTS_KEY, JSON.stringify(defaults));
  } catch {
    // ignore storage failures
  }
}

export function buildSetupFromDefaults(defaults: ProductionDefaults): ComposeSetup {
  return {
    speakerCount: defaults.defaultSpeakerCount,
    speakers: defaults.defaultSpeakers.slice(0, defaults.defaultSpeakerCount),
    mode: defaults.defaultMode,
    targetSpeaker: defaults.defaultTargetSpeaker,
    usesProductionDefault: true,
    isOverrideFromProductionDefault: false,
  };
}
