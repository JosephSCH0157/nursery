import assert from "node:assert/strict";
import test from "node:test";
import { resolveHammerRouteSelection } from "../src/app/hammerNavigation";
import { getHammerStubLaunchScenario } from "../src/dev/hammerStubLaunches";

test("production route selection ignores stub scenarios when they are not allowed", () => {
  const scenario = getHammerStubLaunchScenario("clean-workpiece");
  const selection = resolveHammerRouteSelection(
    "?hammer_stub=clean-workpiece",
    {
      hammerStubLaunchId: scenario.id,
      hammerLaunchContext: scenario.launchContext,
    },
    { allowStubScenario: false },
  );

  assert.equal(selection.scenario, null);
  assert.equal(selection.launchContext, undefined);
});

test("dev route selection still resolves stub scenarios when explicitly allowed", () => {
  const selection = resolveHammerRouteSelection(
    "?hammer_stub=clean-workpiece",
    null,
    { allowStubScenario: true },
  );

  assert.equal(selection.scenario?.id, "clean-workpiece");
  assert.equal(selection.launchContext?.workpiece_id, "22222222-2222-4222-8222-222222222222");
});
