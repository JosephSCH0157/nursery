import {
  buildHammerEditorHref,
  buildHammerRouteState,
} from "@hammer/app/hammerNavigation";
import {
  listHammerStubLaunchScenarios,
  readHammerStubLaunchScenarioId,
} from "@hammer/dev/hammerStubLaunches";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./HammerLaunchStub.css";

export default function HammerLaunchStubRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const scenarios = useMemo(() => listHammerStubLaunchScenarios(), []);
  const scenarioIdFromSearch = readHammerStubLaunchScenarioId(location.search);
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    () => scenarioIdFromSearch ?? scenarios[0]?.id ?? "clean-workpiece",
  );

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId],
  );

  const payloadJson = useMemo(
    () => JSON.stringify(selectedScenario?.launchContext ?? {}, null, 2),
    [selectedScenario],
  );

  function openScenarioInHammer() {
    if (!selectedScenario) return;
    navigate(buildHammerEditorHref(location.search, selectedScenario), {
      state: buildHammerRouteState(selectedScenario),
    });
  }

  return (
    <section className="hammer-launch-stub">
      <header className="hammer-launch-stub__header">
        <div>
          <h2 className="hammer-launch-stub__title">Hammer Stub Launches</h2>
          <p className="hammer-launch-stub__subtitle">
            Simulate a Tongs-to-Hammer handoff with a real launch payload before full Forge wiring lands.
          </p>
        </div>
        <button
          type="button"
          className="hammer-launch-stub__open"
          onClick={openScenarioInHammer}
          disabled={!selectedScenario}
        >
          Continue to Editing
        </button>
      </header>

      <div className="hammer-launch-stub__layout">
        <section className="hammer-launch-stub__panel hammer-launch-stub__panel--scenarios">
          <h3>Stub Scenarios</h3>
          <div className="hammer-launch-stub__scenario-list">
            {scenarios.map((scenario) => {
              const isActive = scenario.id === selectedScenario?.id;
              return (
                <button
                  key={scenario.id}
                  type="button"
                  className={`hammer-launch-stub__scenario ${isActive ? "is-active" : ""}`}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  <strong>{scenario.title}</strong>
                  <span>{scenario.summary}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="hammer-launch-stub__panel">
          <h3>Scenario Checks</h3>
          {selectedScenario ? (
            <div className="hammer-launch-stub__details">
              <div>
                <div className="hammer-launch-stub__label">Expected outcome</div>
                <div>{selectedScenario.expectedOutcome}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Source mode</div>
                <div>{selectedScenario.launchContext.source_mode}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Workspace id</div>
                <div className="hammer-launch-stub__mono">{selectedScenario.launchContext.workspace_id}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Workpiece id</div>
                <div className="hammer-launch-stub__mono">{selectedScenario.launchContext.workpiece_id}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Session id</div>
                <div className="hammer-launch-stub__mono">{selectedScenario.launchContext.session_id ?? "none"}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Transcript source kind</div>
                <div>{selectedScenario.launchContext.transcript.kind}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Media source kind</div>
                <div>{selectedScenario.launchContext.media.kind}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Edit plan present</div>
                <div>{selectedScenario.launchContext.edit_plan ? "yes" : "no"}</div>
              </div>
              <div>
                <div className="hammer-launch-stub__label">Preview mode</div>
                <div>{selectedScenario.launchContext.preview_mode ?? "edit-aware"}</div>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="hammer-launch-stub__panel hammer-launch-stub__panel--payload">
        <div className="hammer-launch-stub__payload-header">
          <h3>Launch Payload</h3>
          <div className="hammer-launch-stub__payload-note">
            This object is passed into Hammer through route state, with a query fallback for reloads.
          </div>
        </div>
        <pre className="hammer-launch-stub__payload">{payloadJson}</pre>
      </section>
    </section>
  );
}
