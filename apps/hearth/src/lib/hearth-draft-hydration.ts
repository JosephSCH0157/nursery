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
