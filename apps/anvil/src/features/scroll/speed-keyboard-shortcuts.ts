export type SpeedShortcutMode = 'timed' | 'wpm' | 'hybrid' | string;

export type SpeedShortcutDirection = 1 | -1;
export const AUTO_SPEED_ADJUST_EVENT = 'tp:autoSpeed:adjust';

export interface SpeedKeyboardShortcutOptions {
  getMode: () => SpeedShortcutMode;
  adjustTimed: (direction: SpeedShortcutDirection, coarse: boolean) => void;
  adjustWpm: (direction: SpeedShortcutDirection, coarse: boolean) => void;
  target?: Document;
}

const installedTargets = new WeakMap<Document, SpeedKeyboardShortcutOptions>();

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element
    ? target
    : target instanceof Node
      ? target.parentElement
      : null;
  if (!element) return false;
  if (element.closest('input, textarea, select, button')) return true;
  const editable = element.closest('[contenteditable]');
  return !!editable && editable.getAttribute('contenteditable')?.toLowerCase() !== 'false';
}

export function installSpeedKeyboardShortcuts(options: SpeedKeyboardShortcutOptions): void {
  const target = options.target ?? (typeof document !== 'undefined' ? document : null);
  if (!target) return;
  if (installedTargets.has(target)) {
    installedTargets.set(target, options);
    return;
  }
  installedTargets.set(target, options);

  target.addEventListener('keydown', (event) => {
    const activeOptions = installedTargets.get(target);
    if (!activeOptions) return;
    const keyboardEvent = event as KeyboardEvent;
    if (keyboardEvent.defaultPrevented || keyboardEvent.isComposing) return;
    if (keyboardEvent.ctrlKey || keyboardEvent.altKey || keyboardEvent.metaKey) return;
    if (isEditableTarget(keyboardEvent.target)) return;

    const direction: SpeedShortcutDirection | null = keyboardEvent.key === 'ArrowUp'
      ? 1
      : keyboardEvent.key === 'ArrowDown'
        ? -1
        : null;
    if (!direction) return;

    const mode = String(activeOptions.getMode() || '').toLowerCase();
    if (mode !== 'timed' && mode !== 'wpm' && mode !== 'hybrid') return;

    keyboardEvent.preventDefault();
    if (mode === 'timed') {
      activeOptions.adjustTimed(direction, keyboardEvent.shiftKey);
      return;
    }
    activeOptions.adjustWpm(direction, keyboardEvent.shiftKey);
  }, { capture: true });
}
