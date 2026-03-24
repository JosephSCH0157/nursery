import { useEffect, useMemo, useState } from "react";
import type { CanonicalSpeakerId, ComposeSetup, ComposeMode, ProductionDefaults } from "../domain/compose";
import { composeSetupDiffersFromDefaults } from "../lib/compose-defaults";
import "./ComposeSetupModal.css";

const ALL_SPEAKERS: CanonicalSpeakerId[] = ["s1", "s2", "g1", "g2"];

type Props = {
  open: boolean;
  defaults: ProductionDefaults;
  onClose: () => void;
  onCompose: (setup: ComposeSetup, options?: { saveAsDefault?: boolean }) => void;
  canSaveAsDefault?: boolean;
};

function clampSpeakers(speakers: CanonicalSpeakerId[], count: 1 | 2 | 3 | 4): CanonicalSpeakerId[] {
  const unique = Array.from(new Set(speakers)).filter((speaker): speaker is CanonicalSpeakerId => ALL_SPEAKERS.includes(speaker));
  const fallback = ALL_SPEAKERS.slice(0, count);
  return (unique.length > 0 ? unique : fallback).slice(0, count);
}

export default function ComposeSetupModal(props: Props) {
  const { defaults } = props;
  const [customize, setCustomize] = useState(false);
  const [speakerCount, setSpeakerCount] = useState<1 | 2 | 3 | 4>(defaults.defaultSpeakerCount);
  const [speakers, setSpeakers] = useState<CanonicalSpeakerId[]>(defaults.defaultSpeakers);
  const [mode, setMode] = useState<ComposeMode>(defaults.defaultMode);
  const [targetSpeaker, setTargetSpeaker] = useState<CanonicalSpeakerId | null>(defaults.defaultTargetSpeaker);
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  useEffect(() => {
    if (!props.open) return;
    setCustomize(false);
    setSpeakerCount(defaults.defaultSpeakerCount);
    setSpeakers(defaults.defaultSpeakers);
    setMode(defaults.defaultMode);
    setTargetSpeaker(defaults.defaultTargetSpeaker);
    setSaveAsDefault(false);
  }, [props.open, defaults]);

  const normalizedSpeakers = useMemo(() => clampSpeakers(speakers, speakerCount), [speakers, speakerCount]);
  const canSubmit = mode !== "full_script_single_speaker" || Boolean(targetSpeaker);

  if (!props.open) return null;

  const standardSetup: ComposeSetup = {
    speakerCount: defaults.defaultSpeakerCount,
    speakers: defaults.defaultSpeakers.slice(0, defaults.defaultSpeakerCount),
    mode: defaults.defaultMode,
    targetSpeaker: defaults.defaultTargetSpeaker,
    usesProductionDefault: true,
    isOverrideFromProductionDefault: false,
  };

  const customSetup: ComposeSetup = {
    speakerCount,
    speakers: normalizedSpeakers,
    mode,
    targetSpeaker: mode === "full_script_single_speaker" ? targetSpeaker : null,
    usesProductionDefault: false,
    isOverrideFromProductionDefault: true,
  };
  const customSetupDiffersFromDefaults = composeSetupDiffersFromDefaults(customSetup, defaults);
  const showSaveAsDefault = (props.canSaveAsDefault ?? true) && customSetupDiffersFromDefaults;

  return (
    <div className="hs-compose-modal-backdrop" role="presentation">
      <section className="hs-compose-modal" aria-label="Compose script setup">
        <header className="hs-compose-modal-header">
          <h3>Compose Script</h3>
          <button type="button" onClick={props.onClose}>Close</button>
        </header>

        {!customize ? (
          <div className="hs-compose-modal-panel">
            <p>Hearth recognized your standard production setup.</p>
            <p>
              {defaults.defaultSpeakerCount} speakers · {defaults.defaultSpeakers.join(", ")} · {defaults.defaultMode}
              {defaults.defaultMode === "full_script_single_speaker" && defaults.defaultTargetSpeaker
                ? ` (${defaults.defaultTargetSpeaker})`
                : ""}
            </p>
            <div className="hs-compose-modal-actions">
              <button type="button" onClick={() => props.onCompose(standardSetup, { saveAsDefault: false })}>Compose now</button>
              <button type="button" onClick={() => setCustomize(true)}>Change setup</button>
            </div>
          </div>
        ) : (
          <div className="hs-compose-modal-panel">
            <label>
              Number of speakers
              <select
                value={speakerCount}
                onChange={(event) => setSpeakerCount(Number(event.target.value) as 1 | 2 | 3 | 4)}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={4}>4</option>
              </select>
            </label>

            <label>
              Roles
              <select
                multiple
                value={normalizedSpeakers}
                onChange={(event) => {
                  const next = Array.from(event.target.selectedOptions).map((option) => option.value as CanonicalSpeakerId);
                  setSpeakers(clampSpeakers(next, speakerCount));
                }}
              >
                {ALL_SPEAKERS.map((speaker) => (
                  <option key={speaker} value={speaker}>{speaker}</option>
                ))}
              </select>
            </label>

            <label>
              Output mode
              <select value={mode} onChange={(event) => setMode(event.target.value as ComposeMode)}>
                <option value="outline_by_speaker">Bullet points only</option>
                <option value="full_script_single_speaker">Full script for one speaker</option>
                <option value="full_script_all_speakers">Full script for all speakers</option>
              </select>
            </label>

            {mode === "full_script_single_speaker" ? (
              <label>
                Target speaker
                <select
                  value={targetSpeaker ?? ""}
                  onChange={(event) => setTargetSpeaker((event.target.value || null) as CanonicalSpeakerId | null)}
                >
                  <option value="">Select speaker</option>
                  {normalizedSpeakers.map((speaker) => (
                    <option key={speaker} value={speaker}>{speaker}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {showSaveAsDefault ? (
              <label className="hs-compose-modal-checkbox">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(event) => setSaveAsDefault(event.target.checked)}
                />
                <span>Save this setup as the new standard for this production</span>
                <small>Future Compose actions will use this setup by default.</small>
              </label>
            ) : null}

            <div className="hs-compose-modal-actions">
              <button type="button" onClick={() => setCustomize(false)}>Use standard setup</button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => props.onCompose(customSetup, { saveAsDefault })}
              >
                Compose now
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
