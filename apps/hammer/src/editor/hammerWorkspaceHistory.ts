export interface HammerHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  undo: () => void;
  redo: () => void;
  affectedSegments?: string[];
  toolId?: string;
}

export interface HammerHistoryState {
  undoStack: HammerHistoryEntry[];
  redoStack: HammerHistoryEntry[];
  maxSize: number;
}

export function createHammerHistoryState(maxSize = 100): HammerHistoryState {
  return {
    undoStack: [],
    redoStack: [],
    maxSize,
  };
}

export function pushHammerHistoryEntry(state: HammerHistoryState, entry: HammerHistoryEntry): void {
  state.undoStack.push(entry);
  state.redoStack.length = 0;
  if (state.undoStack.length > state.maxSize) {
    state.undoStack.shift();
  }
}

export function undoHammerHistory(state: HammerHistoryState): boolean {
  const entry = state.undoStack.at(-1);
  if (!entry) {
    return false;
  }

  try {
    entry.undo();
  } catch (error) {
    console.error("Hammer undo failed", {
      entryId: entry.id,
      label: entry.label,
      error,
    });
    return false;
  }

  state.undoStack.pop();
  state.redoStack.push(entry);
  return true;
}

export function redoHammerHistory(state: HammerHistoryState): boolean {
  const entry = state.redoStack.at(-1);
  if (!entry) {
    return false;
  }

  try {
    entry.redo();
  } catch (error) {
    console.error("Hammer redo failed", {
      entryId: entry.id,
      label: entry.label,
      error,
    });
    return false;
  }

  state.redoStack.pop();
  state.undoStack.push(entry);
  return true;
}

export function clearHammerHistory(state: HammerHistoryState): void {
  state.undoStack.length = 0;
  state.redoStack.length = 0;
}
