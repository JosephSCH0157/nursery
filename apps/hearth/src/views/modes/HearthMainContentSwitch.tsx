import type { ReactNode } from "react";

type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";

type HearthMainContentSwitchProps = {
  showSparkRouteBootstrap: boolean;
  mode: HearthMode;
  renderSparkRouteBootstrapView: () => ReactNode;
  renderSparksView: () => ReactNode;
  renderEpisodesView: () => ReactNode;
  renderReadyView: () => ReactNode;
  renderSeriesView: () => ReactNode;
  renderFocusEditor: () => ReactNode;
};

export default function HearthMainContentSwitch({
  showSparkRouteBootstrap,
  mode,
  renderSparkRouteBootstrapView,
  renderSparksView,
  renderEpisodesView,
  renderReadyView,
  renderSeriesView,
  renderFocusEditor,
}: HearthMainContentSwitchProps) {
  if (showSparkRouteBootstrap) {
    return <>{renderSparkRouteBootstrapView()}</>;
  }

  switch (mode) {
    case "sparks":
      return <>{renderSparksView()}</>;
    case "episodes":
      return <>{renderEpisodesView()}</>;
    case "ready":
      return <>{renderReadyView()}</>;
    case "series":
      return <>{renderSeriesView()}</>;
    case "focus":
    default:
      return <>{renderFocusEditor()}</>;
  }
}
