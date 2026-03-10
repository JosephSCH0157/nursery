import { buildHammerEditorHref, buildHammerRouteState } from "./hammerNavigation";
import { listHammerStubLaunchScenarios } from "../dev/hammerStubLaunches";
import { useMemo, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./HammerProjectLibrary.css";

export default function HammerProjectLibrary(): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const scenarios = useMemo(() => listHammerStubLaunchScenarios(), []);
  const [selectedScenarioId, setSelectedScenarioId] = useState(
    () => scenarios[0]?.id ?? "clean-workpiece",
  );

  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? scenarios[0],
    [scenarios, selectedScenarioId],
  );

  function openScenario(scenarioId: string) {
    const scenario = scenarios.find((item) => item.id === scenarioId);
    if (!scenario) return;
    navigate(buildHammerEditorHref(location.search, scenario), {
      state: buildHammerRouteState(scenario),
    });
  }

  return (
    <section className="hammer-project-library">
      <header className="hammer-project-library__header">
        <div className="hammer-project-library__intro">
          <div className="hammer-project-library__eyebrow">
            Hammer Project Library
          </div>
          <h2 className="hammer-project-library__title">Project Library</h2>
          <div className="hammer-project-library__summary">
            Open a Hammer project first, then move into the editor. This screen stays minimal on purpose:
            project selection, project creation, and nothing that turns Hammer into a marketplace or toybox.
          </div>
        </div>
        <div className="hammer-project-library__actions">
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--primary"
            onClick={() => openScenario("clean-workpiece")}
          >
            New Project
          </button>
          <button
            type="button"
            className="hammer-project-library__button hammer-project-library__button--secondary"
            onClick={() => {
              if (!selectedScenario) return;
              openScenario(selectedScenario.id);
            }}
            disabled={!selectedScenario}
          >
            Open Project
          </button>
        </div>
      </header>

      <section className="hammer-project-library__section">
        <div className="hammer-project-library__section-title">Project Library</div>
        <div className="hammer-project-library__grid">
          {scenarios.map((scenario) => {
            const isSelected = scenario.id === selectedScenario?.id;
            return (
              <button
                key={scenario.id}
                type="button"
                className={`hammer-project-library__card${isSelected ? " is-selected" : ""}`}
                onClick={() => {
                  setSelectedScenarioId(scenario.id);
                  openScenario(scenario.id);
                }}
                onFocus={() => setSelectedScenarioId(scenario.id)}
              >
                <div
                  className="hammer-project-library__poster"
                  style={{ background: scenario.poster_tint } satisfies CSSProperties}
                >
                  {scenario.poster_label}
                </div>
                <div className="hammer-project-library__card-body">
                  <div className="hammer-project-library__card-title">{scenario.title}</div>
                  <div className="hammer-project-library__card-summary">
                    {scenario.summary}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}
