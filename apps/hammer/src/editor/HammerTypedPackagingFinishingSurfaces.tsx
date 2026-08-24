import type { JSX } from "react";
import type { HammerFinishingToolBayContext, HammerPackagingToolBayContext } from "./hammerToolBayContext";
import { derivePackagingIntroStatusView } from "./hammerPackagingIntroStatusView";
import type { HammerLogoOverlayPosition, HammerLogoOverlaySize } from "./hammerWorkspaceShellVisualUtils";

type PackagingFinishingSurfaceContext = HammerPackagingToolBayContext | HammerFinishingToolBayContext;

export function HammerTypedPackagingFinishingSurfaces(props: { context: PackagingFinishingSurfaceContext }): JSX.Element {
  return props.context.surface === "packaging" ? <PackagingSurface context={props.context} /> : <FinishingSurface context={props.context} />;
}

function PackagingSurface(props: { context: HammerPackagingToolBayContext }): JSX.Element {
  const { commands, data, surface } = props.context;
  const { selectedIntroPath: introOutroSelectedIntroPath, selectedOutroPath: introOutroSelectedOutroPath, selectedIntroAssetId, selectedOutroAssetId, introPlaced: packagingIntroPlacement, outroPlaced: packagingOutroPlacement, logoAssetPath: packagingLogoAssetPath, logoPlaced: packagingLogoPlacement, logoPosition: packagingLogoPosition, logoSize: packagingLogoSize, sourceImageLibraryItems, logoPositionOptions: LOGO_POSITION_OPTIONS, logoSizeOptions: LOGO_SIZE_OPTIONS, introEntryId: PACKAGING_INTRO_ENTRY_ID, outroEntryId: PACKAGING_OUTRO_ENTRY_ID } = data;
  const introOutroSelection = { intro_asset_id: selectedIntroAssetId, outro_asset_id: selectedOutroAssetId };
  const applyIntroPlacement = commands.applyIntro;
  const applyOutroPlacement = commands.applyOutro;
  const removePackagingPlacement = commands.removePlacement;
  const applyLogoOverlayStyle = commands.updateLogoStyle;
  const toggleLogoOverlay = commands.toggleLogo;
  const introStatusView = derivePackagingIntroStatusView({ selectedIntroAssetId, selectedIntroPath: introOutroSelectedIntroPath, introPlaced: packagingIntroPlacement });

  return <div data-hammer-tool-bay-surface={surface}>
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
                          commands.focusTool();
                          applyIntroPlacement();
                        }}
                        disabled={!introStatusView.canApply}
                      >
                        {introStatusView.applyActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          commands.focusTool();
                          removePackagingPlacement(PACKAGING_INTRO_ENTRY_ID, "Remove packaging intro");
                        }}
                        disabled={!introStatusView.canRemove}
                      >
                        {introStatusView.removeActionLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          commands.focusTool();
                          applyOutroPlacement();
                        }}
                        disabled={!introOutroSelection.outro_asset_id || !introOutroSelectedOutroPath}
                      >
                        Apply Outro
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          commands.focusTool();
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
                          commands.focusTool();
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
                          commands.focusTool();
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
                          commands.focusTool();
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
                          commands.focusTool();
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
  </div>;
}

function FinishingSurface(props: { context: HammerFinishingToolBayContext }): JSX.Element {
  const { commands, data, surface } = props.context;
  const finishingChecklist = data.checklist;
  return <div data-hammer-tool-bay-surface={surface}>
                <section className="hammer-tool-card">
                  <header className="hammer-tool-card__head">Finishing Checklist</header>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.transcriptReviewed}
                      onChange={(event) => {
                        commands.focusTool();
                        commands.setReviewFlag("transcript", event.target.checked);
                      }}
                    />
                    <span>Transcript reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.visualsReviewed}
                      onChange={(event) => {
                        commands.focusTool();
                        commands.setReviewFlag("visual", event.target.checked);
                      }}
                    />
                    <span>Visuals reviewed</span>
                  </label>
                  <label className="hammer-tool-check">
                    <input
                      type="checkbox"
                      checked={finishingChecklist.audioReviewed}
                      onChange={(event) => {
                        commands.focusTool();
                        commands.setReviewFlag("audio", event.target.checked);
                      }}
                    />
                    <span>Audio reviewed</span>
                  </label>
                </section>
  </div>;
}
