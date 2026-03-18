// src/features/asr/persistence.ts
// Compatibility shims only. App store now owns persisted ASR settings directly.
import { getSpeechStore, type SpeechState } from '../speech/speech-store';

const speechStore = getSpeechStore();

let initialized = false;

export function applySpeechStateFromOwner(next: Partial<SpeechState>): void {
  speechStore.set(next);
}

export function initAsrPersistence(): void {
  if (initialized) return;
  initialized = true;
}
