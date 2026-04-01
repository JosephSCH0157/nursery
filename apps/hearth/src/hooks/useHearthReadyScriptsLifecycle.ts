import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { HearthReadyScript } from "../lib/hearth-ready-scripts";

type UseHearthReadyScriptsLifecycleArgs = {
  workspaceId: string | null;
  normalizeUuid: (value: string | null | undefined) => string | null;
  listReadyScripts: (workspaceId: string) => Promise<HearthReadyScript[]>;
  setReadyScripts: Dispatch<SetStateAction<HearthReadyScript[]>>;
  setReadyScriptsWorkspaceId: (next: string | null) => void;
  setReadyScriptsError: (next: string | null) => void;
  setIsReadyScriptsLoading: (next: boolean) => void;
};

export function useHearthReadyScriptsLifecycle(args: UseHearthReadyScriptsLifecycleArgs) {
  const readyScriptsRequestSeqRef = useRef(0);
  const {
    workspaceId,
    normalizeUuid,
    listReadyScripts,
    setReadyScripts,
    setReadyScriptsWorkspaceId,
    setReadyScriptsError,
    setIsReadyScriptsLoading,
  } = args;

  const refreshReadyScripts = useCallback(async () => {
    const workspace = normalizeUuid(workspaceId);
    const requestSeq = readyScriptsRequestSeqRef.current + 1;
    readyScriptsRequestSeqRef.current = requestSeq;
    if (!workspace) {
      setReadyScripts([]);
      setReadyScriptsWorkspaceId(null);
      setReadyScriptsError(null);
      setIsReadyScriptsLoading(false);
      return;
    }

    setIsReadyScriptsLoading(true);
    setReadyScriptsError(null);
    try {
      const entries = await listReadyScripts(workspace);
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      setReadyScripts(entries);
      setReadyScriptsWorkspaceId(workspace);
    } catch {
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      setReadyScripts([]);
      setReadyScriptsWorkspaceId(null);
      setReadyScriptsError("Failed to load Ready to Record list.");
    } finally {
      if (readyScriptsRequestSeqRef.current === requestSeq) {
        setIsReadyScriptsLoading(false);
      }
    }
  }, [
    listReadyScripts,
    normalizeUuid,
    setIsReadyScriptsLoading,
    setReadyScripts,
    setReadyScriptsError,
    setReadyScriptsWorkspaceId,
    workspaceId,
  ]);

  return {
    refreshReadyScripts,
  };
}
