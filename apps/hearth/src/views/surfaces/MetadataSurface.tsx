import type { ComponentProps } from "react";
import CollapsibleFocusPanel from "../../components/focus/CollapsibleFocusPanel";
import MetadataPanel from "../../components/metadata/MetadataPanel";

type FramingPrepSection = {
  key: string;
  label: string;
  content: string;
};

type MetadataSurfaceProps = {
  visible: boolean;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
  metadataPanelMeta: string;
  metadataPanelProps: ComponentProps<typeof MetadataPanel>;
  aiCreditsDepleted: boolean;
  isAiProcessing: boolean;
  activeProductionAction: string | null;
  releasePrepScriptVersion: number | null;
  latestReleasePrepRawText: string | null;
  releasePrepLoadState: "idle" | "loading" | "ready" | "missing" | "error";
  latestReleasePrepSections: FramingPrepSection[];
  onGenerateTitles: () => void;
  onGenerateTags: () => void;
  onGenerateFramingPack: () => void;
  onRefreshFramingPack: () => void;
};

export default function MetadataSurface(props: MetadataSurfaceProps) {
  if (!props.visible || !props.hasApprovedScript || !props.approvedScriptVersion) return null;

  return (
    <CollapsibleFocusPanel
      panelId="hearth-metadata-panel"
      title="Framing"
      meta={props.metadataPanelMeta}
      collapsed={false}
      onToggle={() => {}}
      collapsible={false}
    >
      <section className="hs-release-prep-viewer" aria-label="Framing workspace">
        <div className="hs-release-prep-viewer__head">
          <strong>Framing</strong>
          <span>Shape what the episode is about before thumbnails and launch packaging.</span>
        </div>
        <div className="hs-production-action-row" role="group" aria-label="Framing actions">
          <button
            type="button"
            onClick={props.onGenerateTitles}
            disabled={props.isAiProcessing || props.aiCreditsDepleted}
          >
            {props.activeProductionAction === "seo" && props.isAiProcessing ? "Generating..." : "Generate Titles"}
          </button>
          <button
            type="button"
            onClick={props.onGenerateTags}
            disabled={props.isAiProcessing || props.aiCreditsDepleted}
          >
            {props.activeProductionAction === "tags" && props.isAiProcessing ? "Generating..." : "Generate Tags"}
          </button>
          <button
            type="button"
            onClick={props.onGenerateFramingPack}
            disabled={props.isAiProcessing || props.aiCreditsDepleted}
          >
            {props.activeProductionAction === "release_prep_pack" && props.isAiProcessing
              ? "Generating..."
              : "Generate Framing Pack"}
          </button>
        </div>
        <div className="hs-release-prep-viewer__meta">
          <span>
            {props.releasePrepScriptVersion
              ? `Script v${props.releasePrepScriptVersion}`
              : `Script v${props.approvedScriptVersion}`}
            {props.latestReleasePrepRawText ? ` · ${props.latestReleasePrepRawText.length} chars` : ""}
          </span>
          <button
            type="button"
            onClick={props.onRefreshFramingPack}
            disabled={props.isAiProcessing || props.releasePrepLoadState === "loading"}
          >
            {props.releasePrepLoadState === "loading" ? "Refreshing..." : "Refresh Pack"}
          </button>
        </div>
        {props.releasePrepLoadState === "missing" ? (
          <div className="hs-field-label-muted">
            No saved Framing Pack for this approved script version yet.
          </div>
        ) : null}
        {props.releasePrepLoadState === "error" ? (
          <div className="hs-error-text-small">Could not load the latest Framing Pack artifact.</div>
        ) : null}
        {props.releasePrepLoadState === "ready" && props.latestReleasePrepSections.length > 0 ? (
          <div className="hs-release-prep-viewer__sections">
            {props.latestReleasePrepSections.map((section) => (
              <article key={section.key} className="hs-release-prep-viewer__section">
                <header>{section.label}</header>
                <pre>{section.content}</pre>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      <MetadataPanel {...props.metadataPanelProps} />
    </CollapsibleFocusPanel>
  );
}
