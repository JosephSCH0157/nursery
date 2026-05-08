/** @jest-environment jsdom */

import type { prepareMatcherInput as _prepareMatcherInput } from '../../src/speech/matcher-input';

describe('matcher input preparation', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('strips meta phrases before tokenization', () => {
    const { prepareMatcherInput } = require('../../src/speech/matcher-input');

    const prepared = prepareMatcherInput(
      "okay so you know I think here's one weird thing",
      (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean),
    );

    expect(prepared.spokenTokens).toEqual(["here's", 'one', 'weird', 'thing']);
  });

  test('limits matcher tokens to the tail window', () => {
    const { prepareMatcherInput } = require('../../src/speech/matcher-input');

    const transcript = Array.from({ length: 24 }, (_, idx) => `w${idx + 1}`).join(' ');
    const prepared = prepareMatcherInput(
      transcript,
      (value: string) => value.toLowerCase().split(/\s+/).filter(Boolean),
    );

    expect(prepared.spokenTokens).toHaveLength(24);
    expect(prepared.matchTokens).toHaveLength(18);
    expect(prepared.matchTokens[0]).toBe('w7');
    expect(prepared.matchTokens[17]).toBe('w24');
  });
});
