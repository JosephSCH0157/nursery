export type RecordingMode = 'av' | 'audio';
export type RecordingEngine = 'core' | 'obs';
export type SavedRecordingConfiguration = { engine: RecordingEngine; mode: RecordingMode };
export type SavedRecordingConfigurationResult =
  | { ok: true; configuration: SavedRecordingConfiguration }
  | { ok: false; reason: 'missing' | 'invalid' };

import { getSettings } from '../../recorders-core';

const readRawSettings = getSettings;

function normalizeSelected(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

export function getRecordingMode(): RecordingMode {
  const raw = readRawSettings();
  const mode = String(raw?.recordingMode || '').toLowerCase();
  const resolved: RecordingMode = mode === 'audio' ? 'audio' : 'av';
  if (resolved === 'audio' && getRecordingEngine() === 'obs') return 'av';
  return resolved;
}

export function getRecordingEngine(): RecordingEngine {
  const raw = readRawSettings();
  const selected = normalizeSelected(raw?.selected);
  const mode = String(raw?.mode || '').toLowerCase();

  if ((mode !== 'single' && mode !== 'multi') || selected.length !== 1 || !['obs', 'core'].includes(selected[0])) {
    throw new Error('Select one recording engine in Recording Settings.');
  }
  return selected[0] as RecordingEngine;
}

export function isAudioOnlyRecording(): boolean {
  return getRecordingMode() === 'audio';
}

export function isObsEngineSelected(): boolean {
  return getRecordingEngine() === 'obs';
}

export function readSavedRecordingConfiguration(): SavedRecordingConfigurationResult {
  if (!window.localStorage.getItem('tp_rec_settings_v1')) return { ok: false, reason: 'missing' };
  const raw = readRawSettings();

  const selected = normalizeSelected(raw.selected);
  const mode = String(raw.mode || '').toLowerCase();
  const recordingMode = String(raw.recordingMode || '').toLowerCase();
  if ((mode !== 'single' && mode !== 'multi') || (recordingMode !== 'av' && recordingMode !== 'audio')) {
    return { ok: false, reason: 'invalid' };
  }
  if (selected.length !== 1 || selected.some((id) => id !== 'core' && id !== 'obs')) {
    return { ok: false, reason: 'invalid' };
  }

  const engine: RecordingEngine = selected.includes('obs') && !selected.includes('core') ? 'obs' : 'core';
  if (engine === 'obs' && recordingMode === 'audio') return { ok: false, reason: 'invalid' };
  return { ok: true, configuration: { engine, mode: recordingMode } };
}
