import path from "node:path";
import { expect, test } from "playwright/test";

test("browser fixture keeps a serialized Topic A research result out of Topic B", async ({ page }) => {
  await page.goto("/app", { waitUntil: "domcontentloaded" });
  const modulePath = `/@fs/${path.resolve(process.cwd(), "../hearth/src/lib/hearth-research-scope.ts").replaceAll("\\", "/")}`;
  const result = await page.evaluate(async ({ modulePath }) => {
    const scope = await import(modulePath) as typeof import("../../hearth/src/lib/hearth-research-scope");
    const topicA = {
      mode: "retrieval_first" as const,
      runtimeStatus: "ok" as const,
      brief: {
        schema: "forge.hearth.research-brief.v1" as const,
        workspaceId: "workspace",
        workpieceId: "workpiece-a",
        briefFingerprint: "fingerprint-a",
        creatorRequest: "Florida citrus Great Freeze HLB development decline",
        episodeTitle: "Florida citrus",
        goals: ["Great Freeze", "HLB"],
        queries: ["Florida citrus"],
        sourcePriorities: [],
      },
      evidence: [],
      artifact: null,
      sources: [],
      synthesis: { summary: "Topic A citrus", keyPoints: [], uncertainties: [], coverageNote: "" },
    };
    const recorded = { workspaceId: "workspace", workpieceId: "workpiece-a", result: topicA };
    return {
      visibleInA: scope.selectActiveHearthResearchResult(recorded, "workspace", "workpiece-a")?.synthesis.summary ?? null,
      visibleInB: scope.selectActiveHearthResearchResult(recorded, "workspace", "workpiece-b")?.synthesis.summary ?? null,
    };
  }, { modulePath });
  expect(result.visibleInA).toBe("Topic A citrus");
  expect(result.visibleInB).toBeNull();
});
