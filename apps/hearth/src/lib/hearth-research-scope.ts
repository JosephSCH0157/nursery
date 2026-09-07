import type { HearthResearchResult } from "./hearth-research-contract";

export type ScopedHearthResearchResult = {
  workspaceId: string | null;
  workpieceId: string | null;
  result: HearthResearchResult | null;
};

export function selectActiveHearthResearchResult(
  recorded: ScopedHearthResearchResult | null,
  workspaceId: string | null,
  workpieceId: string | null,
): HearthResearchResult | null {
  if (!recorded || recorded.workspaceId !== workspaceId || recorded.workpieceId !== workpieceId) return null;
  if (recorded.result?.brief && recorded.result.brief.workpieceId !== workpieceId) return null;
  return recorded.result;
}
