import type { EpisodeSeoTitle } from "./episode-package-v2";

const TITLE_SLOT_LABELS = ["A", "B", "C"] as const;

export type TitleSlotLabel = (typeof TITLE_SLOT_LABELS)[number];

function normalizeLabel(value: string): string {
  return value.trim().toUpperCase();
}

export function isTitleSlotLabel(value: string): value is TitleSlotLabel {
  return TITLE_SLOT_LABELS.includes(normalizeLabel(value) as TitleSlotLabel);
}

export function partitionMetadataTitles(titles: EpisodeSeoTitle[]): {
  slotTitles: EpisodeSeoTitle[];
  generatedSuggestions: EpisodeSeoTitle[];
} {
  const slotTitles = TITLE_SLOT_LABELS
    .map((label) => titles.find((title) => normalizeLabel(title.label) === label))
    .filter(Boolean) as EpisodeSeoTitle[];
  const generatedSuggestions = titles.filter((title) => !isTitleSlotLabel(title.label));
  return { slotTitles, generatedSuggestions };
}

export function shouldConfirmTitleSlotReplacement(existingText: string, nextText: string): boolean {
  const existing = existingText.trim();
  const next = nextText.trim();
  return existing.length > 0 && existing !== next;
}

export function resolveTitleSlotByLabel(
  titles: EpisodeSeoTitle[],
  slotLabel: TitleSlotLabel,
): EpisodeSeoTitle | null {
  return titles.find((title) => normalizeLabel(title.label) === slotLabel) ?? null;
}

export function applySuggestionToTitleSlot(args: {
  titles: EpisodeSeoTitle[];
  suggestionId: string;
  slotLabel: TitleSlotLabel;
}): EpisodeSeoTitle[] | null {
  const suggestion = args.titles.find((title) => title.id === args.suggestionId);
  if (!suggestion) return null;
  if (isTitleSlotLabel(suggestion.label)) return null;
  const slot = resolveTitleSlotByLabel(args.titles, args.slotLabel);
  if (!slot) return null;
  return args.titles.map((title) => (
    title.id === slot.id
      ? {
        ...title,
        text: suggestion.text,
      }
      : title
  ));
}
