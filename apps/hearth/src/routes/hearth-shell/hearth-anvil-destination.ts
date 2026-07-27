import { buildOpenInAnvilHref } from "./hearth-shell-route";

export function buildHearthAnvilDestination(args: {
  workspaceId: string | null;
  workpieceId: string | null;
  archived: boolean;
}): string | null {
  if (args.archived) return null;
  return buildOpenInAnvilHref(args.workspaceId, args.workpieceId);
}
