import { useCallback } from "react";
import type { Draft } from "../../domain/draft";
import { readTongsCanonicalApprovedScript } from "../../lib/hearth-approval-authority";

type UseCanonicalImageMapScriptReaderArgs = {
  workpieceId: string | null;
  activeDraft: Draft | null;
  listWorkpieceDrafts: (workpieceId: string) => Promise<Draft[]>;
};

export function useCanonicalImageMapScriptReader(args: UseCanonicalImageMapScriptReaderArgs) {
  const readCanonicalScriptForImageMapGeneration = useCallback(async (): Promise<{
    ok: true;
    text: string;
    source: "approved_script";
    includesUnsavedLocalEdits: boolean;
  } | {
    ok: false;
    message: string;
  }> => {
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId) {
      return { ok: false, message: "Select an Episode before generating visuals." };
    }

    const approvedScript = await readTongsCanonicalApprovedScript(episodeId);
    if (!approvedScript) {
      return { ok: false, message: "No canonical approved script found for this workpiece yet." };
    }
    return {
      ok: true,
      text: approvedScript.text,
      source: "approved_script",
      includesUnsavedLocalEdits: Boolean(
        args.activeDraft?.body && args.activeDraft.body.trim() && args.activeDraft.body !== approvedScript.text,
      ),
    };
  }, [args]);

  return { readCanonicalScriptForImageMapGeneration };
}
