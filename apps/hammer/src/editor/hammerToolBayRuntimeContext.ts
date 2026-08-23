import {
  buildHammerToolBayContext,
  type HammerExportToolBayContext,
  type HammerPassCompletionToolBayContext,
  type HammerReleaseReadinessToolBayContext,
  type HammerToolBayContext,
} from "./hammerToolBayContext";
import type { HammerPassId } from "../persistence/hammerPersistenceContract";
import type { HammerToolBayRouteDecision } from "./hammerToolBayRouteDecision";

export const HAMMER_MIGRATED_TOOL_BAY_SURFACES = [
  "unsupported",
  "release_readiness",
  "export",
  "pass_completion",
] as const;

export const HAMMER_TOOL_BAY_LEGACY_REMOVAL_DEADLINE = "HTB-3B completion" as const;

export type HammerToolBayRuntimeContexts = Readonly<{
  completion: HammerPassCompletionToolBayContext | null;
  body: Extract<HammerToolBayContext, { surface: "unsupported" | "release_readiness" | "export" }> | null;
}>;

export function assembleHammerToolBayRuntimeContexts(args: Readonly<{
  route: HammerToolBayRouteDecision;
  currentPass: HammerPassId;
  passLabel: string;
  passStatus: string;
  markPassComplete: () => void;
  readinessData: HammerReleaseReadinessToolBayContext["data"] | null;
  exportData: HammerExportToolBayContext["data"] | null;
  focusIssue: () => void;
  sendToQuench: () => void;
}>): HammerToolBayRuntimeContexts {
  if (args.route.status === "unsupported") {
    return {
      completion: null,
      body: {
        surface: "unsupported",
        route: args.route,
        data: { reason: args.route.reason, selectedPlacementId: args.route.selectedPlacementId },
        commands: {},
      },
    };
  }

  if (args.route.status !== "resolved") return { completion: null, body: null };

  const completion = buildHammerToolBayContext({
    surface: "pass_completion",
    route: args.route,
    data: { passLabel: args.passLabel, passStatus: args.passStatus, complete: args.passStatus === "complete" },
    commands: { markPassComplete: args.markPassComplete },
  });
  const typedCompletion = completion.surface === "pass_completion" ? completion : null;
  if (args.route.surface !== "release_readiness" && args.route.surface !== "export") return { completion: typedCompletion, body: null };

  const releaseCommands = { focusIssue: args.focusIssue, sendToQuench: args.sendToQuench };
  const body = args.route.surface === "release_readiness"
    ? buildHammerToolBayContext({ surface: "release_readiness", route: args.route, data: args.readinessData, commands: releaseCommands })
    : buildHammerToolBayContext({ surface: "export", route: args.route, data: args.exportData, commands: releaseCommands });
  return {
    completion: typedCompletion,
    body: body.surface === "release_readiness" || body.surface === "export" || body.surface === "unsupported" ? body : null,
  };
}
