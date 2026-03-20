export const TITLE_FONT_PRESETS = {
  bold_sans: {
    label: "Bold Sans",
    css: "'Arial Black', 'Segoe UI', Arial, sans-serif",
  },
  condensed_sans: {
    label: "Condensed",
    css: "'Arial Narrow', 'Roboto Condensed', Arial, sans-serif",
  },
  cinematic_serif: {
    label: "Cinematic Serif",
    css: "Georgia, 'Times New Roman', serif",
  },
  modern_clean: {
    label: "Modern Clean",
    css: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
  },
} as const;

export type TitleFontPreset = keyof typeof TITLE_FONT_PRESETS;

export const TITLE_SHADOW_STRENGTH_VALUES = ["soft", "medium", "strong"] as const;

export type TitleShadowStrength = (typeof TITLE_SHADOW_STRENGTH_VALUES)[number];

export type EpisodeThumbnailTitleShadow = {
  enabled?: boolean;
  strength?: TitleShadowStrength;
};

export type NormalizedEpisodeThumbnailTitleShadow = {
  enabled: boolean;
  strength: TitleShadowStrength;
};

export type EpisodeThumbnailTitleStyle = {
  font_preset?: TitleFontPreset;
  text_color?: string;
  shadow?: EpisodeThumbnailTitleShadow;
};

export type NormalizedEpisodeThumbnailTitleStyle = {
  font_preset: TitleFontPreset;
  text_color: string;
  shadow: NormalizedEpisodeThumbnailTitleShadow;
};

export const DEFAULT_TITLE_STYLE: NormalizedEpisodeThumbnailTitleStyle = {
  font_preset: "bold_sans",
  text_color: "#FFFFFF",
  shadow: {
    enabled: true,
    strength: "medium",
  },
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeTitleFontPreset(value: unknown): TitleFontPreset {
  const preset = readString(value);
  if (preset && preset in TITLE_FONT_PRESETS) {
    return preset as TitleFontPreset;
  }
  return DEFAULT_TITLE_STYLE.font_preset;
}

export function normalizeTitleTextColor(value: unknown): string {
  const color = readString(value);
  if (!color) return DEFAULT_TITLE_STYLE.text_color;
  const expandedHex = color.match(/^#([0-9a-f]{3})$/i);
  if (expandedHex?.[1]) {
    const [r, g, b] = expandedHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return color.toUpperCase();
  }
  return color;
}

export function normalizeTitleShadowStrength(value: unknown): TitleShadowStrength {
  const strength = readString(value);
  if (strength && TITLE_SHADOW_STRENGTH_VALUES.includes(strength as TitleShadowStrength)) {
    return strength as TitleShadowStrength;
  }
  return DEFAULT_TITLE_STYLE.shadow.strength;
}

export function normalizeEpisodeThumbnailTitleStyle(value: unknown): NormalizedEpisodeThumbnailTitleStyle {
  const shadow = isRecord(value) && isRecord(value.shadow) ? value.shadow : null;
  return {
    font_preset: normalizeTitleFontPreset(isRecord(value) ? value.font_preset : null),
    text_color: normalizeTitleTextColor(isRecord(value) ? value.text_color : null),
    shadow: {
      enabled: shadow ? Boolean(shadow.enabled ?? DEFAULT_TITLE_STYLE.shadow.enabled) : DEFAULT_TITLE_STYLE.shadow.enabled,
      strength: normalizeTitleShadowStrength(shadow?.strength),
    },
  };
}

export function areEpisodeThumbnailTitleStylesEqual(
  left: unknown,
  right: unknown,
): boolean {
  const normalizedLeft = normalizeEpisodeThumbnailTitleStyle(left);
  const normalizedRight = normalizeEpisodeThumbnailTitleStyle(right);
  return (
    normalizedLeft.font_preset === normalizedRight.font_preset
    && normalizedLeft.text_color === normalizedRight.text_color
    && normalizedLeft.shadow.enabled === normalizedRight.shadow.enabled
    && normalizedLeft.shadow.strength === normalizedRight.shadow.strength
  );
}

export function getShadowCss(shadow: EpisodeThumbnailTitleShadow | null | undefined): string {
  if (!shadow?.enabled) return "none";

  switch (shadow.strength) {
    case "soft":
      return "0 1px 2px rgba(0,0,0,0.6)";
    case "strong":
      return "0 4px 10px rgba(0,0,0,0.9)";
    default:
      return "0 2px 8px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.38)";
  }
}
