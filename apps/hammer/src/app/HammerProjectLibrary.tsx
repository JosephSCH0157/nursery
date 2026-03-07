import { buildHammerEditorHref, buildHammerRouteState } from "./hammerNavigation";
import { listHammerStubLaunchScenarios } from "../dev/hammerStubLaunches";
import { useMemo, useState } from "react";
import type { CSSProperties, JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const ROOT_STYLE: CSSProperties = {
  display: "grid",
  gap: 18,
  color: "#dbe8ff",
};

const HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  flexWrap: "wrap",
  padding: 18,
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "linear-gradient(160deg, rgba(15, 23, 42, 0.92), rgba(2, 6, 23, 0.94))",
};

const ACTION_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const PRIMARY_BUTTON_STYLE: CSSProperties = {
  borderRadius: 10,
  border: "1px solid rgba(96, 165, 250, 0.62)",
  background: "rgba(59, 130, 246, 0.18)",
  color: "#dbe8ff",
  padding: "10px 14px",
  fontWeight: 600,
  cursor: "pointer",
};

const SECONDARY_BUTTON_STYLE: CSSProperties = {
  ...PRIMARY_BUTTON_STYLE,
  border: "1px solid rgba(148, 163, 184, 0.32)",
  background: "rgba(15, 23, 42, 0.72)",
};

const GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 16,
};

const CARD_STYLE: CSSProperties = {
  borderRadius: 18,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "rgba(15, 23, 42, 0.76)",
  overflow: "hidden",
  display: "grid",
  gap: 0,
  cursor: "pointer",
  textAlign: "left",
  color: "#dbe8ff",
};

const POSTER_STYLE: CSSProperties = {
  minHeight: 148,
  display: "grid",
  placeItems: "center",
  padding: 18,
  fontSize: 24,
  fontWeight: 700,
  letterSpacing: "0.08em",
};

const CARD_BODY_STYLE: CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 14,
};

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
    <section style={ROOT_STYLE}>
      <header style={HEADER_STYLE}>
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <div style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.64 }}>
            Hammer Project Library
          </div>
          <h2 style={{ margin: 0, fontSize: 30 }}>Project Library</h2>
          <div style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.78 }}>
            Open a Hammer project first, then move into the editor. This screen stays minimal on purpose:
            project selection, project creation, and nothing that turns Hammer into a marketplace or toybox.
          </div>
        </div>
        <div style={ACTION_ROW_STYLE}>
          <button
            type="button"
            style={PRIMARY_BUTTON_STYLE}
            onClick={() => openScenario("clean-workpiece")}
          >
            New Project
          </button>
          <button
            type="button"
            style={SECONDARY_BUTTON_STYLE}
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

      <section style={{ display: "grid", gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Project Library</div>
        <div style={GRID_STYLE}>
          {scenarios.map((scenario) => {
            const isSelected = scenario.id === selectedScenario?.id;
            return (
              <button
                key={scenario.id}
                type="button"
                style={{
                  ...CARD_STYLE,
                  borderColor: isSelected
                    ? "rgba(96, 165, 250, 0.72)"
                    : "rgba(148, 163, 184, 0.24)",
                  boxShadow: isSelected
                    ? "0 16px 32px rgba(37, 99, 235, 0.14)"
                    : "none",
                }}
                onClick={() => {
                  setSelectedScenarioId(scenario.id);
                  openScenario(scenario.id);
                }}
                onFocus={() => setSelectedScenarioId(scenario.id)}
              >
                <div style={{ ...POSTER_STYLE, background: scenario.poster_tint }}>
                  {scenario.poster_label}
                </div>
                <div style={CARD_BODY_STYLE}>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{scenario.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.72 }}>
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
