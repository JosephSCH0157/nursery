import type { JSX } from "react";
import type { HammerLogoOverlayPosition, HammerLogoOverlaySize } from "./hammerWorkspaceShellVisualUtils";

type PackagingIntroStatusView = Readonly<{ selectionStatusLine: string; placementStatusLine: string; applyActionLabel: string; removeActionLabel: string; canApply: boolean; canRemove: boolean }>;
function derivePackagingIntroStatusView(args: { selectedIntroAssetId: string | null; selectedIntroPath: string | null; introPlaced: boolean }): PackagingIntroStatusView { const selected = Boolean(args.selectedIntroAssetId); const resolved = Boolean(args.selectedIntroAssetId && args.selectedIntroPath); return { selectionStatusLine: selected ? (resolved ? "Selected intro from Source Desk: " + args.selectedIntroPath : "Selected intro from Source Desk is unresolved (" + args.selectedIntroAssetId + ").") : "No intro selected in Source Desk.", placementStatusLine: args.introPlaced ? "Timeline packaging intro: placed." : "Timeline packaging intro: not placed.", applyActionLabel: "Apply Selected Intro to Timeline", removeActionLabel: "Remove Intro from Timeline", canApply: resolved, canRemove: args.introPlaced }; }
type PackagingFinishingSurfaceModel = Readonly<{ introOutroSelectedIntroPath: string | null; introOutroSelectedOutroPath: string | null; introOutroSelection: { intro_asset_id: string | null; outro_asset_id: string | null }; packagingIntroPlacement: unknown | null; packagingOutroPlacement: unknown | null; packagingLogoAssetPath: string | null; packagingLogoPlacement: unknown | null; packagingLogoPosition: HammerLogoOverlayPosition; packagingLogoSize: HammerLogoOverlaySize; sourceImageLibraryItems: readonly { path: string; name: string }[]; LOGO_POSITION_OPTIONS: readonly { id: HammerLogoOverlayPosition; label: string }[]; LOGO_SIZE_OPTIONS: readonly { id: HammerLogoOverlaySize; label: string }[]; PACKAGING_INTRO_ENTRY_ID: string; PACKAGING_OUTRO_ENTRY_ID: string; applyIntroPlacement(): void; applyOutroPlacement(): void; removePackagingPlacement(id: string, label: string): void; applyLogoOverlayStyle(input: { assetPath?: string | null; position?: HammerLogoOverlayPosition; size?: HammerLogoOverlaySize }): void; toggleLogoOverlay(): void; finishingChecklist: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }; setFinishingChecklist(next: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean } | ((current: { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean }) => { transcriptReviewed: boolean; visualsReviewed: boolean; audioReviewed: boolean })): void; setFocusOverride(mode: "auto" | "source-focus" | "tool-focus" | "time-focus"): void }>;
import type { HammerFinishingToolBayContext, HammerPackagingToolBayContext } from "./hammerToolBayContext";

type PackagingFinishingSurfaceContext = HammerPackagingToolBayContext | HammerFinishingToolBayContext;

export function HammerTypedPackagingFinishingSurfaces(props: { context: PackagingFinishingSurfaceContext }): JSX.Element {
  const { surface } = props.context;
  const packaging = props.context.data.model as PackagingFinishingSurfaceModel;
  const setFocusOverride = packaging.setFocusOverride;
  const { introOutroSelectedIntroPath, introOutroSelectedOutroPath, introOutroSelection, packagingIntroPlacement, packagingOutroPlacement, packagingLogoAssetPath, packagingLogoPlacement, packagingLogoPosition, packagingLogoSize, sourceImageLibraryItems, LOGO_POSITION_OPTIONS, LOGO_SIZE_OPTIONS, PACKAGING_INTRO_ENTRY_ID, PACKAGING_OUTRO_ENTRY_ID, applyIntroPlacement, applyOutroPlacement, removePackagingPlacement, applyLogoOverlayStyle, toggleLogoOverlay, finishingChecklist, setFinishingChecklist } = packaging;
  const introStatusView = derivePackagingIntroStatusView({ selectedIntroAssetId: introOutroSelection.intro_asset_id, selectedIntroPath: introOutroSelectedIntroPath, introPlaced: Boolean(packagingIntroPlacement) });

  return <div data-hammer-tool-bay-surface={surface}>
              {surface === "packaging" || surface === "finishing" ? (
                surface === "packaging" ? (
                  <section className="hammer-tool-card">
                    <header className="hammer-tool-card__head">Packaging</header>
                    <div className="hammer-tool-hint">
                      Packaging placement controls only. Choose intro/outro assets in Source Desk.
                    </div>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyIntroPlacement();
                        }}
                        disabled={!introStatusView.canApply}
                      >
                        {introStatusView.applyActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_INTRO_ENTRY_ID, "Remove packaging intro");
                        }}
                        disabled={!introStatusView.canRemove}
                      >
                        {introStatusView.removeActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          applyOutroPlacement();
                        }}
                        disabled={!introOutroSelection.outro_asset_id || !introOutroSelectedOutroPath}
                      >
                        Apply Outro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          removePackagingPlacement(PACKAGING_OUTRO_ENTRY_ID, "Remove packaging outro");
                        }}
                        disabled={!packagingOutroPlacement}
                      >
                        Remove Outro
                      </button>
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.selectionStatusLine} ·
                      {" "}Outro: {introOutroSelection.outro_asset_id
                        ? (introOutroSelectedOutroPath ? "selected" : "selected (unresolved)")
                        : "not selected"}
                    </div>
                    <div className="hammer-tool-hint">
                      {introStatusView.placementStatusLine} ·
                      {" "}Outro applied: {packagingOutroPlacement ? "yes" : "no"}
                    </div>

                    <label className="hammer-tool-field">
                      <span>Logo Asset</span>
                      <select
                        value={packagingLogoAssetPath ?? ""}
                        onChange={(event) => {
                          const nextPath = event.target.value || null;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ assetPath: nextPath });
                        }}
                      >
                        <option value="">No logo selected</option>
                        {sourceImageLibraryItems.map((item) => (
                          <option key={`logo-${item.path}`} value={item.path}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-source-card__actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusOverride("tool-focus");
                          toggleLogoOverlay();
                        }}
                        disabled={!packagingLogoPlacement && !packagingLogoAssetPath}
                      >
                        {packagingLogoPlacement ? "Disable Logo Overlay" : "Toggle Logo Overlay"}
                      </button>
                    </div>
                    <label className="hammer-tool-field">
                      <span>Logo Position</span>
                      <select
                        value={packagingLogoPosition}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlayPosition;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ position: next });
                        }}
                      >
                        {LOGO_POSITION_OPTIONS.map((option) => (
                          <option key={`logo-position-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="hammer-tool-field">
                      <span>Logo Size</span>
                      <select
                        value={packagingLogoSize}
                        onChange={(event) => {
                          const next = event.target.value as HammerLogoOverlaySize;
                          setFocusOverride("tool-focus");
                          applyLogoOverlayStyle({ size: next });
                        }}
                      >
                        {LOGO_SIZE_OPTIONS.map((option) => (
                          <option key={`logo-size-${option.id}`} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="hammer-tool-hint">
                      Logo overlay: {packagingLogoPlacement ? "enabled (episode-wide)" : "disabled"}
                    </div>
                    <div className="hammer-tool-hint">
                      Thumbnails and visual prompts are generated in Hearth. Hammer only consumes existing assets from Tongs / workspace.
                    </div>
                  </section>
                ) : (
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          transcriptReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          visualsReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        setFocusOverride("tool-focus");
                        setFinishingChecklist((current) => ({
                          ...current,
                          audioReviewed: event.target.checked,
                        }));
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
                )
              ) : null}
  </div>;
}
