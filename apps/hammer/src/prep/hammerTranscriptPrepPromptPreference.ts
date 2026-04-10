export type HammerTranscriptPrepNonAiMissingBehavior =
  | "retry-non-ai"
  | "use-ai-fallback";

const LS_KEY = "forge:hammer:transcriptPrep:nonAiMissing:behavior:v1";

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LS_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, value);
  } catch {
    // ignore
  }
}

export function readHammerTranscriptPrepNonAiMissingBehavior(): HammerTranscriptPrepNonAiMissingBehavior | null {
  const raw = readStorage();
  if (raw === "retry-non-ai" || raw === "use-ai-fallback") return raw;
  return null;
}

export function saveHammerTranscriptPrepNonAiMissingBehavior(
  value: HammerTranscriptPrepNonAiMissingBehavior,
): void {
  writeStorage(value);
}

export function clearHammerTranscriptPrepNonAiMissingBehavior(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

