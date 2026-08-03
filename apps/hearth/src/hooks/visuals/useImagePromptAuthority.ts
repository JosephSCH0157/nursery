import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EpisodeImageMapEntry } from "../../lib/episode-package-v2";
import { editCanonicalImagePrompt, interpretCanonicalImagePrompt, readCurrentCanonicalImagePrompt, type CanonicalImagePromptRevision } from "../../lib/hearth-image-prompt-authority";

export type ImagePromptAuthorityState = {
  status: "idle" | "loading" | "missing" | "pending" | "saving" | "ready" | "error";
  stage: "readback" | "pending" | "committed" | null;
  revision: CanonicalImagePromptRevision | null;
  errorCode: string | null;
  error: string | null;
};

export function useImagePromptAuthority(args: { workpieceId: string | null; workspaceId: string | null; entries: EpisodeImageMapEntry[]; selectedEntry: EpisodeImageMapEntry | null; creatorDirection: string; style: string }) {
  const [state, setState] = useState<ImagePromptAuthorityState>({ status: "idle", stage: null, revision: null, errorCode: null, error: null });
  const requestSerial = useRef(0);
  const selectedEntryId = args.selectedEntry?.id ?? null;
  const selectedIndex = useMemo(() => args.selectedEntry ? args.entries.findIndex((entry) => entry.id === args.selectedEntry?.id) : -1, [args.entries, args.selectedEntry]);
  const sourceContext = useMemo<Record<string, unknown>>(() => ({
    before: selectedIndex > 0 ? args.entries[selectedIndex - 1]?.script_anchor?.span_text || args.entries[selectedIndex - 1]?.description || null : null,
    focus: args.selectedEntry?.script_anchor?.span_text || args.selectedEntry?.description || args.selectedEntry?.prompt_basis || null,
    after: selectedIndex >= 0 && selectedIndex < args.entries.length - 1 ? args.entries[selectedIndex + 1]?.script_anchor?.span_text || args.entries[selectedIndex + 1]?.description || null : null,
    image_direction: args.creatorDirection,
    editorial_purpose: args.selectedEntry?.section_intent_note || null,
    placement_hint: args.selectedEntry?.placement_hint || null,
  }), [args.creatorDirection, args.entries, args.selectedEntry, selectedIndex]);

  const refresh = useCallback(async () => {
    const serial = ++requestSerial.current;
    if (!args.workpieceId || !args.workspaceId || !selectedEntryId) { setState({ status: "idle", stage: null, revision: null, errorCode: null, error: null }); return null; }
    setState({ status: "loading", stage: "readback", revision: null, errorCode: null, error: null });
    const result = await readCurrentCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, imageMomentId: selectedEntryId });
    if (serial !== requestSerial.current) return null;
    if (!result.ok) { setState({ status: "error", stage: "readback", revision: null, errorCode: result.code, error: result.error }); return null; }
    const revision = result.data?.revision ?? null;
    setState({ status: revision ? "ready" : "missing", stage: revision ? "committed" : "readback", revision, errorCode: null, error: null });
    return revision;
  }, [args.workpieceId, args.workspaceId, selectedEntryId]);

  useEffect(() => { void refresh(); return () => { requestSerial.current += 1; }; }, [refresh]);

  const interpret = useCallback(async () => {
    if (!args.workpieceId || !args.workspaceId || !args.selectedEntry || !args.creatorDirection.trim()) return;
    const serial = ++requestSerial.current;
    setState((current) => ({ ...current, status: "pending", stage: "pending", errorCode: null, error: null }));
    const result = await interpretCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, imageMomentId: args.selectedEntry.id, sourceContext, creatorDirection: args.creatorDirection.trim(), style: args.style || null });
    if (serial !== requestSerial.current) return;
    if (!result.ok) { setState((current) => ({ ...current, status: "error", stage: current.revision ? "committed" : "pending", errorCode: result.code, error: result.error })); return; }
    setState({ status: "ready", stage: "committed", revision: result.data, errorCode: null, error: null });
  }, [args.creatorDirection, args.selectedEntry, args.style, args.workpieceId, args.workspaceId, sourceContext]);

  const saveEdit = useCallback(async (finalPrompt: string) => {
    if (!args.workpieceId || !args.workspaceId || !state.revision || !finalPrompt.trim()) return;
    const serial = ++requestSerial.current;
    setState((current) => ({ ...current, status: "saving", stage: "committed", errorCode: null, error: null }));
    const result = await editCanonicalImagePrompt({ workpieceId: args.workpieceId, workspaceId: args.workspaceId, current: state.revision!, finalPrompt: finalPrompt.trim() });
    if (serial !== requestSerial.current) return;
    if (!result.ok) { setState((current) => ({ ...current, status: "error", errorCode: result.code, error: result.error })); return; }
    setState({ status: "ready", stage: "committed", revision: result.data, errorCode: null, error: null });
  }, [args.workpieceId, args.workspaceId, state.revision]);

  return { state, refresh, interpret, saveEdit };
}
