import type { Draft, DraftAttribution } from "../domain/draft";

const EMPTY_DRAFT_PLACEHOLDER = "## Draft Script";

function normalizeBody(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

export function draftHasUsableScriptBody(
  draft: Pick<Draft, "body"> | null | undefined,
): boolean {
  const normalized = normalizeBody(draft?.body);
  return normalized.length > 0 && normalized !== EMPTY_DRAFT_PLACEHOLDER;
}

export function choosePreferredHydratedDraft(
  drafts: ReadonlyArray<Draft | null | undefined>,
): Draft | null {
  let preferred: Draft | null = null;

  for (const candidate of drafts) {
    if (!candidate) continue;
    if (!preferred) {
      preferred = candidate;
      continue;
    }

    const preferredHasBody = draftHasUsableScriptBody(preferred);
    const candidateHasBody = draftHasUsableScriptBody(candidate);
    if (preferredHasBody !== candidateHasBody) {
      preferred = candidateHasBody ? candidate : preferred;
      continue;
    }

    const preferredUpdatedAt = preferred.updatedAt ?? preferred.createdAt ?? 0;
    const candidateUpdatedAt = candidate.updatedAt ?? candidate.createdAt ?? 0;
    if (candidateUpdatedAt >= preferredUpdatedAt) {
      preferred = candidate;
    }
  }

  return preferred ? { ...preferred } : null;
}

export function hydrateDraftBodyFromCanonicalScript(args: {
  draft: Draft;
  scriptText: string;
  updatedAt: number;
  updatedBy?: DraftAttribution | null;
}): Draft {
  return {
    ...args.draft,
    body: args.scriptText,
    updatedAt: Math.max(args.draft.updatedAt, args.updatedAt),
    updatedBy: args.updatedBy ?? args.draft.updatedBy ?? null,
  };
}

export type CanonicalImageMapScriptSource = {
  source: "primary_script" | "saved_draft";
  text: string;
};

function scoreCanonicalScriptText(text: string): number {
  const normalized = normalizeBody(text);
  if (!normalized) return 0;

  let score = normalized.length;
  if (/\[(s1|s2|g1|g2|note)\]/i.test(normalized)) score += 400;
  if (normalized.includes("\n")) score += 120;
  if (/\n\s*\n/.test(normalized)) score += 80;
  return score;
}

export function chooseCanonicalImageMapScriptSource(args: {
  primaryText: string | null | undefined;
  primaryUpdatedAtMs?: number | null;
  drafts?: ReadonlyArray<Draft | null | undefined>;
  preferredDraftId?: string | null;
}): CanonicalImageMapScriptSource | null {
  const primaryText = normalizeBody(args.primaryText);
  const preferredDraftId = typeof args.preferredDraftId === "string" ? args.preferredDraftId.trim() : "";
  const preferredDraft = preferredDraftId
    ? args.drafts?.find((draft) => draft?.id === preferredDraftId) ?? null
    : null;
  const savedDraft = draftHasUsableScriptBody(preferredDraft)
    ? preferredDraft
    : choosePreferredHydratedDraft(args.drafts ?? []);
  const savedDraftText = normalizeBody(savedDraft?.body);

  if (!primaryText && !savedDraftText) return null;
  if (!primaryText) {
    return savedDraftText ? { source: "saved_draft", text: savedDraftText } : null;
  }
  if (!savedDraftText) {
    return { source: "primary_script", text: primaryText };
  }

  const primaryUpdatedAtMs = args.primaryUpdatedAtMs ?? 0;
  const savedDraftUpdatedAtMs = savedDraft?.updatedAt ?? savedDraft?.createdAt ?? 0;
  const savedDraftScore = scoreCanonicalScriptText(savedDraftText);
  const primaryScore = scoreCanonicalScriptText(primaryText);
  const savedDraftIsRicher = savedDraftScore > Math.max(primaryScore * 1.5, primaryScore + 160);
  const savedDraftIsNewer = savedDraftUpdatedAtMs > primaryUpdatedAtMs;

  if (savedDraftText !== primaryText && (savedDraftIsNewer || savedDraftIsRicher)) {
    return { source: "saved_draft", text: savedDraftText };
  }

  return { source: "primary_script", text: primaryText };
}
