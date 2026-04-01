import { useCallback } from "react";
import type { Draft } from "../../domain/draft";
import { readHearthPrimaryScript } from "../../lib/hearth-script-repo";
import { chooseCanonicalImageMapScriptSource } from "../../lib/hearth-draft-hydration";

function parseIsoTimestamp(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function dedupeDraftListById(input: Draft[]): Draft[] {
  const seen = new Map<string, Draft>();
  for (const draft of input) {
    if (!seen.has(draft.id)) {
      seen.set(draft.id, draft);
      continue;
    }
    const current = seen.get(draft.id)!;
    if ((draft.updatedAt ?? draft.createdAt) > (current.updatedAt ?? current.createdAt)) {
      seen.set(draft.id, draft);
    }
  }
  return Array.from(seen.values()).sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}

type UseCanonicalImageMapScriptReaderArgs = {
  workpieceId: string | null;
  activeDraft: Draft | null;
  listWorkpieceDrafts: (workpieceId: string) => Promise<Draft[]>;
};

export function useCanonicalImageMapScriptReader(args: UseCanonicalImageMapScriptReaderArgs) {
  const readCanonicalScriptForImageMapGeneration = useCallback(async (): Promise<{
    ok: true;
    text: string;
    source: "primary_script" | "saved_draft";
    includesUnsavedLocalEdits: boolean;
  } | {
    ok: false;
    message: string;
  }> => {
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      return { ok: false, message: "Select an Episode before generating visuals." };
    }

    const primaryScript = await readHearthPrimaryScript(episodeId);
    const canonicalDrafts = dedupeDraftListById(await args.listWorkpieceDrafts(episodeId));
    const preferredDraft = args.activeDraft?.id
      ? canonicalDrafts.find((draft) => draft.id === args.activeDraft?.id) ?? null
      : null;
    const latestDraft = preferredDraft ?? canonicalDrafts
      .slice()
      .sort((a, b) => (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0))[0]
      ?? null;
    const canonicalChoice = chooseCanonicalImageMapScriptSource({
      primaryText: primaryScript.ok ? primaryScript.data.text : null,
      primaryUpdatedAtMs: primaryScript.ok ? (parseIsoTimestamp(primaryScript.data.updatedAt) ?? 0) : null,
      drafts: canonicalDrafts,
      preferredDraftId: args.activeDraft?.id ?? null,
    });

    if (canonicalChoice) {
      return {
        ok: true,
        text: canonicalChoice.text,
        source: canonicalChoice.source,
        includesUnsavedLocalEdits: Boolean(
          args.activeDraft?.body
          && args.activeDraft.body.trim()
          && args.activeDraft.body !== canonicalChoice.text,
        ),
      };
    }

    if (!latestDraft?.body.trim()) {
      return { ok: false, message: "No canonical script found for this workpiece yet." };
    }

    return {
      ok: true,
      text: latestDraft.body,
      source: "saved_draft",
      includesUnsavedLocalEdits: Boolean(
        args.activeDraft?.body && args.activeDraft.body.trim() && args.activeDraft.body !== latestDraft.body,
      ),
    };
  }, [args]);

  return { readCanonicalScriptForImageMapGeneration };
}
