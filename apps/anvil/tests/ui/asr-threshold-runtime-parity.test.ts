import fs from 'node:fs';
import path from 'node:path';

import {
  getAsrDriverThresholds,
  setAsrProfileThresholdOverrides,
} from '../../src/asr/asr-threshold-store';

describe('ASR threshold runtime parity', () => {
  afterEach(() => {
    setAsrProfileThresholdOverrides(null);
    window.history.replaceState({}, '', '/');
    window.localStorage.clear();
  });

  it.each([
    ['production', '/anvil/teleprompter_pro.html'],
    ['dev', '/anvil/teleprompter_pro.html?dev=1'],
  ])('keeps active profile thresholds in %s mode', (_mode, url) => {
    window.history.replaceState({}, '', url);
    setAsrProfileThresholdOverrides({
      candidateMinSim: 0.31,
      commitFinalMinSim: 0.27,
      commitInterimMinSim: 0.23,
    });

    expect(getAsrDriverThresholds()).toMatchObject({
      candidateMinSim: 0.31,
      commitFinalMinSim: 0.27,
      commitInterimMinSim: 0.23,
    });
  });

  it('does not restore speech-setting threshold overwrites at startup or state changes', () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/asr/asr-scroll-driver.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/setAsrDriverThresholds\(\{\s*candidateMinSim:\s*threshold\s*\}\)/);
    expect(source).not.toMatch(/state\.threshold[\s\S]{0,240}candidateMinSim/);
    expect(source).toContain('setAsrProfileThresholdOverrides(profile?.asrTweaks)');
    expect(source).toContain('subscribeSpeakerProfileState');
  });
});
