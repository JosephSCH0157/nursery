import {
  classifyAsrLine,
  collectSkippedAsrRows,
  countSpeakableDistanceAhead,
  isAsrStrictSkippableLine,
  resolveForwardSpeakableTarget,
} from '../../src/features/asr/asr-line-classification';

describe('ASR line classification helpers', () => {
  test('blank rows are skippable', () => {
    expect(classifyAsrLine('   ').skippableReason).toBe('blank');
    expect(classifyAsrLine('   ').strictSkippableReason).toBe('blank');
  });

  test('cue rows like [pause], [beat], [reflective pause] are skippable', () => {
    expect(classifyAsrLine('[pause]').skippableReason).not.toBeNull();
    expect(classifyAsrLine('[beat]').skippableReason).not.toBeNull();
    expect(classifyAsrLine('[reflective pause]').skippableReason).not.toBeNull();
  });

  test('note/speaker rows are skippable where driver treats them as skippable', () => {
    expect(classifyAsrLine('[s1]').skippableReason).toBe('speaker');
    expect(classifyAsrLine('[/s2]').strictSkippableReason).toBe('speaker');
    expect(classifyAsrLine('[note] stage direction [/note]').skippableReason).toBe('note');
    expect(classifyAsrLine('[/note]').strictSkippableReason).toBe('note');
  });

  test('content rows are not skippable', () => {
    expect(classifyAsrLine('The train doors open on a rainy morning.').skippableReason).toBeNull();
    expect(isAsrStrictSkippableLine('The train doors open on a rainy morning.')).toBe(false);
  });

  test('next speakable across cue/blank rows returns correct target', () => {
    const lines = ['content 0', '[pause]', '   ', '[s1]', 'content 4'];
    const target = resolveForwardSpeakableTarget({
      currentLine: 0,
      requestedTarget: 4,
      maxSpeakableSteps: 1,
      totalLines: lines.length,
      getLineText: (idx) => lines[idx] ?? '',
    });
    expect(target).toBe(4);
  });

  test('speakable distance differs from rendered distance when cue/blank rows are between current and target', () => {
    const lines = ['alpha', '[pause]', ' ', '[note]x[/note]', 'beta'];
    const speakableDistance = countSpeakableDistanceAhead({
      fromLine: 0,
      targetLine: 4,
      totalLines: lines.length,
      getLineText: (idx) => lines[idx] ?? '',
    });
    const renderedDistance = 4 - 0;
    expect(speakableDistance).toBe(1);
    expect(speakableDistance).not.toBe(renderedDistance);
  });

  test('skipped row collection preserves expected indexes/classes for bridge diagnostics use', () => {
    const lines = ['start', '[pause]', '[s1]', '[note]x[/note]', 'target'];
    const collected = collectSkippedAsrRows({
      currentLine: 0,
      targetLine: 4,
      getLineText: (idx) => lines[idx] ?? '',
      strict: true,
    });
    expect(collected.skippedReasons).toEqual(['cue', 'speaker', 'note']);
    expect(collected.skippedNonIgnorable).toBe(false);
  });
});
