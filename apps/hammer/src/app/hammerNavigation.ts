import type { HammerLaunchContext } from "../../../../packages/contracts/hammer/launch-context.contract";
import {
  getHammerStubLaunchScenario,
  readHammerStubLaunchScenarioId,
  type HammerStubLaunchScenario,
  type HammerStubLaunchScenarioId,
} from "../dev/hammerStubLaunches";

export type HammerRouteState = {
  hammerLaunchContext?: HammerLaunchContext;
  hammerStubLaunchId?: HammerStubLaunchScenarioId;
};

function isHammerLaunchContext(value: unknown): value is HammerLaunchContext {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.workspace_id === "string"
    && typeof row.workpiece_id === "string"
    && typeof row.source_mode === "string"
    && !!row.transcript
    && !!row.media
  );
}

export function buildHammerRouteState(
  scenario: HammerStubLaunchScenario,
): HammerRouteState {
  return {
    hammerLaunchContext: scenario.launchContext,
    hammerStubLaunchId: scenario.id,
  };
}

export function buildHammerEditorHref(
  baseSearch: string,
  scenario: HammerStubLaunchScenario,
  outputId = "main-edit",
): string {
  const params = new URLSearchParams(baseSearch);
  params.set("workspace_id", scenario.launchContext.workspace_id);
  params.set("workpiece_id", scenario.launchContext.workpiece_id);
  params.set("hammer_stub", scenario.id);
  params.set("output", outputId);
  const nextSearch = params.toString();
  return nextSearch ? `/app/hammer/editor?${nextSearch}` : "/app/hammer/editor";
}

export function resolveHammerRouteSelection(
  search: string,
  state: unknown,
): { launchContext?: HammerLaunchContext; scenario: HammerStubLaunchScenario | null } {
  const routeState = (state ?? null) as HammerRouteState | null;
  const scenarioIdFromState = routeState?.hammerStubLaunchId ?? null;
  const scenarioId = scenarioIdFromState ?? readHammerStubLaunchScenarioId(search);
  const scenario = scenarioId ? getHammerStubLaunchScenario(scenarioId) : null;

  if (isHammerLaunchContext(routeState?.hammerLaunchContext)) {
    return {
      launchContext: routeState.hammerLaunchContext,
      scenario,
    };
  }

  if (!scenario) {
    return {
      launchContext: undefined,
      scenario: null,
    };
  }

  return {
    launchContext: scenario.launchContext,
    scenario,
  };
}
