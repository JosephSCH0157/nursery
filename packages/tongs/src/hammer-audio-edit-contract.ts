export type HammerAudioEditCutOperation = {
  id: string;
  type: "cut";
  start_sec: number;
  end_sec: number;
};

export type HammerAudioEditOperation = HammerAudioEditCutOperation;

export interface HammerPersistedAudioEdit {
  version: "v1";
  operations: HammerAudioEditOperation[];
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function sortHammerAudioEditOperations(
  operations: HammerAudioEditOperation[],
): HammerAudioEditOperation[] {
  return [...operations].sort((left, right) => (
    left.start_sec - right.start_sec
    || left.end_sec - right.end_sec
    || left.id.localeCompare(right.id)
  ));
}

function canonicalizeHammerAudioEdit(
  value: unknown,
): HammerPersistedAudioEdit | null {
  if (value == null) return null;
  const row = readObject(value);
  if (!row || readString(row.version) !== "v1" || !Array.isArray(row.operations)) {
    return null;
  }

  const operations: HammerAudioEditOperation[] = [];
  for (const entry of row.operations) {
    const operation = readObject(entry);
    const id = readString(operation?.id);
    const type = readString(operation?.type);
    const startSec = readNumber(operation?.start_sec);
    const endSec = readNumber(operation?.end_sec);
    if (!id || type !== "cut" || startSec == null || endSec == null) {
      return null;
    }
    if (startSec < 0 || endSec <= startSec) {
      return null;
    }
    operations.push({
      id,
      type: "cut",
      start_sec: startSec,
      end_sec: endSec,
    });
  }

  return {
    version: "v1",
    operations: sortHammerAudioEditOperations(operations),
  };
}

export function cloneHammerAudioEdit(
  value: HammerPersistedAudioEdit | null | undefined,
): HammerPersistedAudioEdit | null {
  return canonicalizeHammerAudioEdit(value);
}

export function normalizeHammerAudioEdit(
  value: unknown,
): HammerPersistedAudioEdit | null {
  return canonicalizeHammerAudioEdit(value);
}
