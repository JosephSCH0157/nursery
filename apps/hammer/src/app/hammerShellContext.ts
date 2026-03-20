export type HammerShellWorkspaceOption = {
  id: string;
  name: string;
  role?: string | null;
};

export type HammerWorkspaceResolutionState = "ready" | "resolving" | "missing";

export type HammerShellContext = {
  workspaceId: string | null;
  workspaceName: string | null;
  workpieceId: string | null;
  workspaces: HammerShellWorkspaceOption[];
  loadingWorkspaces: boolean;
  workspaceError: string | null;
  workspaceResolutionState: HammerWorkspaceResolutionState;
  selectWorkspace: (workspaceId: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
};
