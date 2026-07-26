import type { HearthAnvilHandoffEligibility } from "./hearth-anvil-handoff-contracts";

export function deriveHearthAnvilHandoffEligibility(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  archived: boolean;
  draftId: string | null;
  scriptText: string;
  handoffBlocked: boolean;
  destination: string | null;
}): HearthAnvilHandoffEligibility {
  if (!args.workspaceId?.trim()) return { kind: "no_workspace" };
  if (!args.workpieceId?.trim()) return { kind: "no_workpiece" };
  if (args.archived) return { kind: "archived" };
  if (!args.draftId) return { kind: "no_draft" };
  if (!args.scriptText.trim()) return { kind: "no_script" };
  if (args.handoffBlocked) return { kind: "invalid", reason: "anvil_validation" };
  if (!args.destination) return { kind: "destination_unavailable" };
  return { kind: "ready" };
}
