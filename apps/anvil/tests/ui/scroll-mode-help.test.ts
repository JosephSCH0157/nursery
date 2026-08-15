/** @jest-environment jsdom */

import { applyScrollModeUI } from '../../src/ui/scrollMode';

function mountModeUi(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `
    <div id="autoRow"></div>
    <div id="autoSpeedWrap"></div>
    <label>Auto-scroll <input id="autoSpeed" /></label>
    <button id="autoToggle"></button>
    <div id="wpmRow"></div>
    <div id="stepControlsRow"></div>
    <p id="scrollModeHelpText">Hybrid follows speech automatically.</p>
  `;
  document.body.appendChild(root);
  return root;
}

describe('scroll mode help text', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('ASR help text does not inherit prior mode text', () => {
    const root = mountModeUi();
    const help = root.querySelector<HTMLElement>('#scrollModeHelpText');
    expect(help).toBeTruthy();

    applyScrollModeUI('timed', root);
    expect(help?.textContent).toBe('Timed scroll runs at the px/s value above.');

    applyScrollModeUI('asr', root);
    expect(help?.textContent).toBe('ASR mode follows confirmed speech commits. Start speech sync to arm ASR.');
  });

  test.each([
    ['timed', 'autoRow', 'wpmRow'],
    ['wpm', 'wpmRow', 'autoRow'],
    ['hybrid', 'wpmRow', 'autoRow'],
  ] as const)('%s exposes its speed controls', (mode, visibleId, hiddenId) => {
    const root = mountModeUi();
    applyScrollModeUI(mode, root);
    const visible = root.querySelector<HTMLElement>(`#${visibleId}`);
    const hidden = root.querySelector<HTMLElement>(`#${hiddenId}`);
    expect(visible?.classList.contains('visually-hidden')).toBe(false);
    expect(visible?.getAttribute('aria-hidden')).toBe('false');
    expect(hidden?.classList.contains('visually-hidden')).toBe(true);
    expect(hidden?.getAttribute('aria-hidden')).toBe('true');
  });
});
