/** @jest-environment jsdom */

import { installSpeedKeyboardShortcuts } from '../../src/features/scroll/speed-keyboard-shortcuts';

function dispatchKey(
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

describe('scroll speed keyboard shortcuts', () => {
  let mode = 'timed';
  let adjustTimed: jest.Mock;
  let adjustWpm: jest.Mock;

  beforeEach(() => {
    document.body.innerHTML = '<main id="surface" tabindex="0"></main>';
    mode = 'timed';
    adjustTimed = jest.fn();
    adjustWpm = jest.fn();
    installSpeedKeyboardShortcuts({
      getMode: () => mode,
      adjustTimed,
      adjustWpm,
      target: document,
    });
  });

  test('routes arrows by canonical mode and prevents native scrolling', () => {
    const surface = document.getElementById('surface')!;
    const timed = dispatchKey('ArrowUp', {}, surface);
    expect(timed.defaultPrevented).toBe(true);
    expect(adjustTimed).toHaveBeenCalledWith(1, false);

    mode = 'wpm';
    const wpm = dispatchKey('ArrowDown', { shiftKey: true }, surface);
    expect(wpm.defaultPrevented).toBe(true);
    expect(adjustWpm).toHaveBeenCalledWith(-1, true);

    mode = 'hybrid';
    dispatchKey('ArrowUp', { repeat: true }, surface);
    expect(adjustWpm).toHaveBeenLastCalledWith(1, false);
    expect(adjustWpm).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['timed', 'ArrowUp', 1],
    ['timed', 'ArrowDown', -1],
    ['wpm', 'ArrowUp', 1],
    ['wpm', 'ArrowDown', -1],
    ['hybrid', 'ArrowUp', 1],
    ['hybrid', 'ArrowDown', -1],
  ] as const)('routes Shift+%s %s as one coarse adjustment', (nextMode, key, direction) => {
    mode = nextMode;
    const event = dispatchKey(key, { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    const expected = [direction, true];
    if (nextMode === 'timed') {
      expect(adjustTimed).toHaveBeenCalledTimes(1);
      expect(adjustTimed).toHaveBeenCalledWith(...expected);
      expect(adjustWpm).not.toHaveBeenCalled();
    } else {
      expect(adjustWpm).toHaveBeenCalledTimes(1);
      expect(adjustWpm).toHaveBeenCalledWith(...expected);
      expect(adjustTimed).not.toHaveBeenCalled();
    }
  });

  test.each(['asr', 'step', 'rehearsal', 'future-mode'])('leaves %s arrows untouched', (nextMode) => {
    mode = nextMode;
    const event = dispatchKey('ArrowDown');
    expect(event.defaultPrevented).toBe(false);
    expect(adjustTimed).not.toHaveBeenCalled();
    expect(adjustWpm).not.toHaveBeenCalled();
  });

  test('ignores editable targets including nested contenteditable descendants', () => {
    document.body.insertAdjacentHTML('beforeend', `
      <input id="input" />
      <textarea id="textarea"></textarea>
      <select id="select"><option>one</option></select>
      <button id="button">button</button>
      <div contenteditable="true"><span id="nested">edit me</span></div>
    `);
    for (const id of ['input', 'textarea', 'select', 'button', 'nested']) {
      const event = dispatchKey('ArrowUp', {}, document.getElementById(id)!);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(adjustTimed).not.toHaveBeenCalled();
  });

  test.each([
    { ctrlKey: true },
    { altKey: true },
    { metaKey: true },
  ])('ignores modified arrows: %p', (modifier) => {
    const event = dispatchKey('ArrowUp', modifier);
    expect(event.defaultPrevented).toBe(false);
    expect(adjustTimed).not.toHaveBeenCalled();
  });

  test('ignores composing and already-claimed events', () => {
    const composing = dispatchKey('ArrowUp', { isComposing: true });
    expect(composing.defaultPrevented).toBe(false);

    const claimed = new KeyboardEvent('keydown', {
      key: 'ArrowUp', bubbles: true, cancelable: true,
    });
    claimed.preventDefault();
    document.body.dispatchEvent(claimed);
    expect(adjustTimed).not.toHaveBeenCalled();
  });

  test('does not claim non-arrow shortcuts', () => {
    for (const key of ['+', '-']) {
      const event = dispatchKey(key);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(adjustTimed).not.toHaveBeenCalled();
    expect(adjustWpm).not.toHaveBeenCalled();
  });

  test('installs only one listener per document', () => {
    installSpeedKeyboardShortcuts({
      getMode: () => mode,
      adjustTimed,
      adjustWpm,
      target: document,
    });
    dispatchKey('ArrowUp');
    expect(adjustTimed).toHaveBeenCalledTimes(1);
  });
});
