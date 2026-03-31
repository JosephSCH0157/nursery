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

  const refreshReadyScripts = useCallback(async () => {
    const workspace = args.normalizeUuid(args.workspaceId);
    const requestSeq = readyScriptsRequestSeqRef.current + 1;
    readyScriptsRequestSeqRef.current = requestSeq;
    if (!workspace) {
      args.setReadyScripts([]);
      args.setReadyScriptsWorkspaceId(null);
      args.setReadyScriptsError(null);
      args.setIsReadyScriptsLoading(false);
      return;
    }

    args.setIsReadyScriptsLoading(true);
    args.setReadyScriptsError(null);
    try {
      const entries = await args.listReadyScripts(workspace);
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      args.setReadyScripts(entries);
      args.setReadyScriptsWorkspaceId(workspace);
    } catch {
      if (readyScriptsRequestSeqRef.current !== requestSeq) return;
      args.setReadyScripts([]);
      args.setReadyScriptsWorkspaceId(null);
      args.setReadyScriptsError("Failed to load Ready to Record list.");
    } finally {
      if (readyScriptsRequestSeqRef.current === requestSeq) {
        args.setIsReadyScriptsLoading(false);
      }
    }
  }, [args]);

  return {
    refreshReadyScripts,
  };
}
