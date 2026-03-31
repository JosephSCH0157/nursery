import { useEffect, useRef, type MutableRefObject } from "react";

type UseHearthWorkspaceResetLifecycleArgs = {
  workspaceId: string | null;
  projectIntakeHandledRef: MutableRefObject<string | null>;
  sparkIntakeHandledRef: MutableRefObject<string | null>;
  onWorkspaceChanged: () => void;
};

export function useHearthWorkspaceResetLifecycle(args: UseHearthWorkspaceResetLifecycleArgs) {
  const previousWorkspaceIdRef = useRef<string | null>(args.workspaceId);

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    if (previousWorkspaceId === args.workspaceId) return;
    previousWorkspaceIdRef.current = args.workspaceId;

    args.projectIntakeHandledRef.current = null;
    args.sparkIntakeHandledRef.current = null;
    args.onWorkspaceChanged();
  }, [args]);
}
