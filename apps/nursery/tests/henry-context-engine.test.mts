import assert from "node:assert/strict";
import test from "node:test";
import { buildHenryContext, resolveHenrySurface } from "../src/henry/henryContext.ts";
import { buildHenryActionAnswer, resolveHenryRecommendation } from "../src/henry/henryMessageEngine.ts";

const WORKSPACE_ID = "2980fc39-8c8b-489a-a900-8d3bd3248432";
const WORKPIECE_ID = "cf464ad0-8745-43df-99ee-7bfca5dddcd8";

test("resolveHenrySurface maps major tool routes", () => {
  assert.equal(resolveHenrySurface("/app/hearth"), "hearth");
  assert.equal(resolveHenrySurface("/app/anvil"), "anvil");
  assert.equal(resolveHenrySurface("/app/hammer/editor"), "hammer");
  assert.equal(resolveHenrySurface("/app/quench"), "quench");
  assert.equal(resolveHenrySurface("/app/barstock"), "bar-stock");
});

test("buildHenryContext maps route and episode fields", () => {
  const context = buildHenryContext({
    pathname: "/app/hearth",
    routeContext: {
      workspaceId: WORKSPACE_ID,
      workpieceId: WORKPIECE_ID,
      hasInvalidWorkspaceId: false,
      hasInvalidWorkpieceId: false,
    },
    episode: {
      episodeId: WORKPIECE_ID,
      title: "Episode Alpha",
      phase: "script",
      displayStatus: "scripted",
      contextState: "active",
      seriesTitle: null,
      sessionId: null,
      source: "loader",
    },
  });

  assert.equal(context.surface, "hearth");
  assert.equal(context.workspaceId, WORKSPACE_ID);
  assert.equal(context.workpieceId, WORKPIECE_ID);
  assert.equal(context.episodeTitle, "Episode Alpha");
  assert.equal(context.displayStatus, "scripted");
});

test("resolveHenryRecommendation emits primary and alternatives", () => {
  const recommendation = resolveHenryRecommendation({
    surface: "hearth",
    routePath: "/app/hearth",
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    episodeTitle: "Episode Alpha",
    phase: "script",
    displayStatus: "scripted",
    episodeContextState: "active",
    workspaceResolutionState: "ready",
  });

  assert.equal(typeof recommendation.primary, "string");
  assert.equal(typeof recommendation.why, "string");
  assert.equal(recommendation.alternatives.length, 2);
});

test("what-next answer includes required format lines", () => {
  const answer = buildHenryActionAnswer("what-next", {
    surface: "hearth",
    routePath: "/app/hearth",
    workspaceId: WORKSPACE_ID,
    workpieceId: WORKPIECE_ID,
    episodeTitle: "Episode Alpha",
    phase: "script",
    displayStatus: "scripted",
    episodeContextState: "active",
    workspaceResolutionState: "ready",
  });

  assert.match(answer, /Best next step:/);
  assert.match(answer, /Why:/);
  assert.match(answer, /You could also:/);
});
