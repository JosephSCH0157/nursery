import type { Draft } from "../../domain/draft";
import type { BarStockSpark } from "../../lib/barstock-sparks";
import type {
  HearthContentCategory,
  HearthReadyScript,
} from "../../lib/hearth-ready-scripts";
import type { EpisodeExternalRequestState } from "../../lib/episode-package-v2";
import { normalizeSeoTags } from "../../lib/episode-package-v2";
import { sortTagsByRelevance } from "../../lib/hearth-tag-relevance";
import {
  TONE_PRESET_OPTIONS,
  type CanonicalImageMapScriptState,
  type DiffLine,
  type HearthUserContext,
  type ReadyLabel,
  type ReadyUrgencyLevel,
} from "./hearth-shell-contracts";
import { readTrimmedString } from "./hearth-shell-route";

const METADATA_TAG_SUGGESTIONS_BY_CATEGORY: Record<string, string[]> = {
  evergreen: ["evergreen", "how-to", "timeless"],
  hot_topic: ["news", "breaking", "analysis"],
  viral_reaction: ["reaction", "trending", "viral"],
  strategic_anchor: ["strategy", "framework", "playbook"],
  community: ["community", "feedback", "q-and-a"],
  reflective: ["reflection", "lessons", "behind-the-scenes"],
  explainer: ["explainer", "guide", "deep-dive"],
  experimental: ["experiment", "prototype", "iteration"],
  backup: ["backup", "quick-hit", "short-form"],
};

const READY_URGENCY_APPLICABLE_CATEGORY_SET = new Set<HearthContentCategory>([
  "hot_topic",
  "viral_reaction",
]);

export const READY_URGENCY_LABEL: Record<ReadyUrgencyLevel, string> = {
  fresh: "Fresh",
  warming: "Warming",
  cooling: "Cooling",
  cold: "Cold",
};

export const READY_LABEL_TO_CATEGORY: Record<ReadyLabel, HearthContentCategory> = {
  hot: "hot_topic",
  evergreen: "evergreen",
  series: "strategic_anchor",
};

export function normalizeRailTitleKey(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTonePreset(value: unknown): string | null {
  const raw = readTrimmedString(value);
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  return TONE_PRESET_OPTIONS.some((option) => option.value === normalized)
    ? normalized
    : null;
}

export function resolveImageMapAnchorStatusView(args: {
  status: "attached" | "beat" | "weak_match" | "orphaned" | "global";
  scriptState: CanonicalImageMapScriptState;
}): { label: string; tone: "neutral" | "ok" | "warning" | "danger"; detail: string } {
  if (args.status === "global") {
    return {
      label: "global",
      tone: "neutral",
      detail: "This visual intent is global and intentionally not attached to a single script span.",
    };
  }
  if (args.status === "orphaned") {
    return {
      label: "orphaned",
      tone: "danger",
      detail: "This visual anchor is orphaned. Repair it deterministically or convert it to a global visual intent.",
    };
  }
  if (args.status === "beat") {
    return {
      label: "beat anchored",
      tone: "ok",
      detail: "This visual beat is attached to an editorial bullet beat and can be refined against the real transcript after recording.",
    };
  }
  if (args.scriptState.status === "loading") {
    return {
      label: args.status === "weak_match" ? "weak match" : "attached",
      tone: "neutral",
      detail: "Validating this structured anchor against the current canonical script.",
    };
  }
  if (args.scriptState.status === "error") {
    return {
      label: "weak match",
      tone: "warning",
      detail: args.scriptState.error ?? "Hearth could not load the current canonical script to verify this anchor.",
    };
  }
  if (args.status === "attached") {
    return {
      label: "attached",
      tone: "ok",
      detail: "This visual beat is anchored to an exact span in the current canonical script.",
    };
  }
  return {
    label: "weak match",
    tone: "warning",
    detail: "This structured anchor no longer has an exact match, but deterministic repair options are available.",
  };
}

export function resolveCanonicalImageMapScriptSourceLabel(
  state: CanonicalImageMapScriptState,
): string | null {
  if (state.status !== "ready" || !state.source) return null;
  return state.source === "primary_script" ? "Source: published script" : "Source: saved draft";
}

export function resolveCanonicalImageMapScriptHint(
  state: CanonicalImageMapScriptState,
): string | null {
  if (state.status === "error") return state.error;
  if (state.status !== "ready") return null;
  if (state.includesUnsavedLocalEdits) {
    return "Unsaved local script edits are not included here. Re-anchoring uses the current canonical saved script.";
  }
  return "Pick the exact sentence or paragraph that should drive still generation for this beat.";
}

export function normalizeGreetingName(name: string | null): string {
  const raw = (name ?? "").trim();
  if (!raw) return "Creator";
  const seed = raw.includes("@") ? (raw.split("@")[0] ?? "").trim() : raw;
  const words = seed
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!words.length) return "Creator";
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function resolveVisualRequestStateLabel(
  state: EpisodeExternalRequestState | null | undefined,
): string {
  switch (state) {
    case "brief_exported":
      return "brief_exported";
    case "sent_external":
      return "sent_external";
    case "awaiting_result":
      return "awaiting_result";
    case "asset_attached":
      return "asset_attached";
    case "resolved":
      return "resolved";
    default:
      return "planned";
  }
}

export function formatUpdatedAt(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export function formatRelativeUpdatedAt(value: number | undefined): string {
  if (!value) return "unknown";
  const diffMs = Date.now() - value;
  const absMs = Math.abs(diffMs);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const weekMs = 7 * dayMs;

  const formatUnit = (unit: Intl.RelativeTimeFormatUnit, amount: number): string => {
    try {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(amount, unit);
    } catch {
      const abs = Math.abs(amount);
      const suffix = amount <= 0 ? "ago" : "from now";
      return `${abs} ${unit}${abs === 1 ? "" : "s"} ${suffix}`;
    }
  };

  if (absMs < hourMs) {
    return formatUnit("minute", -Math.max(1, Math.round(absMs / minuteMs)));
  }
  if (absMs < dayMs) {
    return formatUnit("hour", -Math.round(absMs / hourMs));
  }
  if (absMs < weekMs) {
    return formatUnit("day", -Math.round(absMs / dayMs));
  }
  return formatUnit("week", -Math.round(absMs / weekMs));
}

export function dedupeDraftListById(input: Draft[]): Draft[] {
  const byId = new Map<string, Draft>();
  for (const draft of input) {
    const existing = byId.get(draft.id);
    if (!existing) {
      byId.set(draft.id, draft);
      continue;
    }
    const existingUpdatedAt = existing.updatedAt ?? existing.createdAt ?? 0;
    const nextUpdatedAt = draft.updatedAt ?? draft.createdAt ?? 0;
    if (nextUpdatedAt >= existingUpdatedAt) {
      byId.set(draft.id, draft);
    }
  }
  return [...byId.values()];
}

export function buildDraftAttribution(
  user: HearthUserContext,
): { userId: string | null; displayName: string | null } {
  const displayName = user.displayName.trim() || "Creator";
  return {
    userId: user.userId,
    displayName,
  };
}

export function resolveDraftEditorName(draft: Draft | null | undefined): string {
  const fromUpdated = draft?.updatedBy?.displayName?.trim();
  if (fromUpdated) return fromUpdated;
  const fromCreated = draft?.createdBy?.displayName?.trim();
  if (fromCreated) return fromCreated;
  return "Unknown";
}

export function parseIsoTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function shortenUserIdForUi(value: string | null | undefined): string {
  const userId = readTrimmedString(value);
  if (!userId) return "Unknown";
  if (userId.length <= 12) return userId;
  return `${userId.slice(0, 8)}...`;
}

export function normalizeMetadataTag(tag: string): string | null {
  const cleaned = tag
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || null;
}

export function parseMetadataTagInput(input: string): string[] {
  return input
    .split(/[,\n]/g)
    .map((part) => normalizeMetadataTag(part))
    .filter((value): value is string => Boolean(value));
}

export function buildMetadataTagSuggestions(args: {
  currentTags: string[];
  contentCategory: string | null;
  bodyText: string;
  titleTexts: string[];
}): string[] {
  const normalizedExisting = normalizeSeoTags(args.currentTags);
  const existingSet = new Set(normalizedExisting);
  const suggestions = new Set<string>();

  const categoryTags = args.contentCategory ? (METADATA_TAG_SUGGESTIONS_BY_CATEGORY[args.contentCategory] ?? []) : [];
  for (const tag of categoryTags) {
    const normalized = normalizeMetadataTag(tag);
    if (normalized) suggestions.add(normalized);
  }

  for (const tag of normalizedExisting.slice(0, 5)) {
    const tip = normalizeMetadataTag(`${tag}-tips`);
    const guide = normalizeMetadataTag(`${tag}-guide`);
    if (tip) suggestions.add(tip);
    if (guide) suggestions.add(guide);
  }

  for (const base of ["creator", "content-strategy", "video-essay"]) {
    const normalized = normalizeMetadataTag(base);
    if (normalized) suggestions.add(normalized);
  }

  const candidates = [...suggestions].filter((tag) => !existingSet.has(tag)).slice(0, 12);
  return sortTagsByRelevance(candidates, { body: args.bodyText, titleTexts: args.titleTexts });
}

export function deriveReadyUrgency(
  entry: HearthReadyScript,
  nowMs = Date.now(),
): ReadyUrgencyLevel | null {
  if (!entry.contentCategory || !READY_URGENCY_APPLICABLE_CATEGORY_SET.has(entry.contentCategory)) {
    return null;
  }
  const approvedAtMs = parseIsoTimestamp(entry.updatedAt);
  if (!approvedAtMs) return null;
  const ageMs = Math.max(0, nowMs - approvedAtMs);
  if (ageMs <= 48 * 60 * 60 * 1000) return "fresh";
  if (ageMs <= 5 * 24 * 60 * 60 * 1000) return "warming";
  if (ageMs <= 10 * 24 * 60 * 60 * 1000) return "cooling";
  return "cold";
}

export function reorderVisibleReadyEntries(
  entries: readonly HearthReadyScript[],
  fromId: string,
  toId: string,
): HearthReadyScript[] {
  if (!fromId || !toId || fromId === toId) return [...entries];

  const visible = entries.filter((entry) => !entry.hiddenAt);
  const fromIndex = visible.findIndex((entry) => entry.id === fromId);
  const toIndex = visible.findIndex((entry) => entry.id === toId);
  if (fromIndex < 0 || toIndex < 0) return [...entries];

  const reorderedVisible = visible.slice();
  const [moved] = reorderedVisible.splice(fromIndex, 1);
  if (!moved) return [...entries];
  reorderedVisible.splice(toIndex, 0, moved);

  let visibleIndex = 0;
  return entries.map((entry) => {
    if (entry.hiddenAt) return entry;
    const next = reorderedVisible[visibleIndex] ?? entry;
    visibleIndex += 1;
    return next;
  });
}

export function normalizeTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed || "Untitled Draft";
}

export function countWords(text: string): number {
  const matches = text.trim().match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function resolveReadyLabel(entry: HearthReadyScript): ReadyLabel {
  if (entry.contentCategory === "hot_topic" || entry.contentCategory === "viral_reaction") return "hot";
  if (entry.contentCategory === "strategic_anchor") return "series";
  return "evergreen";
}

export function buildDiffLines(current: string, revision: string): DiffLine[] {
  const leftLines = splitLines(current);
  const rightLines = splitLines(revision);
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const out: DiffLine[] = [];

  for (let i = 0; i < maxLen; i += 1) {
    const left = leftLines[i] ?? "";
    const right = rightLines[i] ?? "";
    const leftTrim = left.trim();
    const rightTrim = right.trim();
    if (leftTrim === "---" || rightTrim === "---") {
      out.push({ left, right, status: "separator" });
      continue;
    }
    if (!left && right) {
      out.push({ left, right, status: "added" });
      continue;
    }
    if (left && !right) {
      out.push({ left, right, status: "removed" });
      continue;
    }
    out.push({ left, right, status: left === right ? "same" : "changed" });
  }
  return out;
}

export function diffCellClass(side: "left" | "right", status: DiffLine["status"]): string {
  const classes = ["hs-diff-cell"];
  if (status === "removed" && side === "left") classes.push("is-removed");
  if (status === "added" && side === "right") classes.push("is-added");
  if (status === "changed") {
    classes.push(side === "left" ? "is-changed-left" : "is-changed-right");
  }
  return classes.join(" ");
}

export function formatSparkDate(value: number | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return String(value);
  }
}

export function deriveSparkTitle(spark: BarStockSpark): string {
  const title = spark.title?.trim();
  if (title) return title;
  const line = spark.body.split(/\r?\n/).find((chunk) => chunk.trim());
  if (line) return line.trim().slice(0, 60);
  return "Untitled Spark";
}

export function buildSparkPreview(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const preview = lines.slice(0, 2).join(" ");
  return preview.length > 180 ? `${preview.slice(0, 177)}...` : preview;
}

export function formatSparkStatus(spark: BarStockSpark): { label: string; detail?: string } {
  if (spark.status === "graduated") {
    return { label: "Graduated" };
  }
  const workpieceId = spark.links?.hearthWorkpieceId ?? spark.links?.hearthDraftId ?? null;
  if (workpieceId) {
    const shortId = workpieceId.length > 8 ? workpieceId.slice(0, 8) : workpieceId;
    return { label: "Forged", detail: shortId };
  }
  if (spark.status === "forged") {
    return { label: "Forged" };
  }
  return { label: "Open" };
}

export function isSparkForged(spark: BarStockSpark): boolean {
  if (spark.links?.hearthWorkpieceId) return true;
  return spark.status === "forged" || spark.status === "graduated";
}

export function formatDecisionAt(value: string | undefined): string {
  if (!value) return "Unknown";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}
