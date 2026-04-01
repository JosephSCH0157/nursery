type BuildHearthDraftScriptPanelStateInput = {
  missingSourcesCount: number;
  unusedSourcesCount: number;
  showManualDraft: boolean;
  showScriptPanel: boolean;
  isCanonicalImageMapScriptPanel: boolean;
  hasScript: boolean;
  scriptPanelSourceLabel: string | null;
  canonicalImageMapScriptStateStatus: "idle" | "loading" | "ready" | "error";
  canonicalImageMapScriptStateError: string | null;
};

type HearthDraftScriptPanelState = {
  sourcesSummary: string;
  unusedSummary: string;
  showScriptEditor: boolean;
  scriptPanelTitle: string;
  scriptPanelMetaText: string;
  scriptPanelPlaceholder: string;
};

export function buildHearthDraftScriptPanelState(
  input: BuildHearthDraftScriptPanelStateInput,
): HearthDraftScriptPanelState {
  const sourcesSummary = input.missingSourcesCount > 0
    ? `${input.missingSourcesCount} missing citation${input.missingSourcesCount === 1 ? "" : "s"}`
    : "No missing citations";
  const unusedSummary = input.unusedSourcesCount > 0 ? ` · ${input.unusedSourcesCount} unused` : "";
  const showScriptEditor = input.showManualDraft || input.showScriptPanel;
  const scriptPanelTitle = input.isCanonicalImageMapScriptPanel
    ? "Canonical Script"
    : (input.showScriptPanel && input.hasScript ? "Script" : "Manual Draft");
  const scriptPanelMetaText = input.isCanonicalImageMapScriptPanel
    ? (input.scriptPanelSourceLabel ?? "Source: canonical script")
    : `Sources: ${sourcesSummary}${unusedSummary}`;
  const scriptPanelPlaceholder = input.isCanonicalImageMapScriptPanel
    ? (input.canonicalImageMapScriptStateStatus === "loading"
      ? "Loading current canonical script..."
      : input.canonicalImageMapScriptStateError ?? "Current canonical script is unavailable.")
    : "Start writing...";

  return {
    sourcesSummary,
    unusedSummary,
    showScriptEditor,
    scriptPanelTitle,
    scriptPanelMetaText,
    scriptPanelPlaceholder,
  };
}
