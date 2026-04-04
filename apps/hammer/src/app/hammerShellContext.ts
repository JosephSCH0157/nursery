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
  userId: string | null;
  workspaces: HammerShellWorkspaceOption[];
  loadingWorkspaces: boolean;
  workspaceError: string | null;
  workspaceResolutionState: HammerWorkspaceResolutionState;
  prepAiNoticeEffectiveLane: "forge-managed" | "personal-byo" | "ai-disabled";
  prepAiNoticeAcknowledgedLaneSignature: string | null;
  prepAiNoticeResolutionState: "loading" | "ready" | "error";
  prepAiNoticeResolutionError: string | null;
  selectWorkspace: (workspaceId: string | null) => void;
  refreshWorkspaces: () => Promise<void>;
  savePrepAiNoticeAcknowledgedLane: (laneSignature: string) => Promise<void>;
  openAiSettings: () => void;
};
