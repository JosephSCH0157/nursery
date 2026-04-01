import {
  buildEmptyHearthResearchResult,
  type HearthResearchRequest,
  type HearthResearchResult,
} from "../../../hearth/src/lib/hearth-research-contract";

export type HearthResearchRuntimeRunArgs = {
  request: HearthResearchRequest;
  workspaceId: string | null;
  workpieceId: string;
  signal?: AbortSignal;
};

export type HearthResearchRuntime = {
  run: (args: HearthResearchRuntimeRunArgs) => Promise<HearthResearchResult>;
};

export function createHearthResearchRuntime(): HearthResearchRuntime {
  return {
    async run(args): Promise<HearthResearchResult> {
      if (args.signal?.aborted) {
        return buildEmptyHearthResearchResult({
          mode: "knowledge_first",
          runtimeStatus: "error",
          summary: "Research runtime was cancelled before execution.",
        });
      }

      // Stage 2 seam: canonical runner path exists and returns canonical shape.
      // Retrieval providers are intentionally deferred to Stage 3.
      return {
        ...buildEmptyHearthResearchResult({
          mode: "knowledge_first",
          runtimeStatus: "partial",
          summary: "Research runtime is in knowledge-first stub mode while retrieval providers are not yet enabled.",
        }),
        synthesis: {
          summary: "Research runtime accepted the request and prepared a knowledge-first pass.",
          keyPoints: [
            `Query accepted: ${args.request.query}`,
            `Intent: ${args.request.intent}; recency: ${args.request.recencyPreference}; max sources requested: ${args.request.maxSources}`,
          ],
          uncertainties: [
            "Live external retrieval is not enabled in this runtime stage.",
            "No fetched sources are available in this pass.",
          ],
          coverageNote: "Stage 2 stub runtime executed successfully with no provider retrieval.",
        },
      };
    },
  };
}
