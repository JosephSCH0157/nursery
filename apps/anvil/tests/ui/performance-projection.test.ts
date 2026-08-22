import {
  createPerformanceProjection,
  assertPerformanceProjectionInvariants,
  PerformanceProjectionError,
  PERFORMANCE_PROJECTION_ALGORITHM_VERSION,
  PERFORMANCE_TOKENIZER_VERSION,
} from '../../src/script/performance-projection';
import { createHash } from 'crypto';

Object.defineProperty(globalThis, 'crypto', {
  configurable: true,
  value: {
    subtle: {
      digest: async (_algorithm: string, data: ArrayBuffer) => {
        const hash = createHash('sha256').update(new Uint8Array(data)).digest();
        return Uint8Array.from(hash).buffer;
      },
    },
  },
});

const encoder = new TextEncoder();
const SOURCE = {
  workspaceId: '11111111-1111-4111-8111-111111111111',
  workpieceId: '22222222-2222-4222-8222-222222222222',
  path: 'script/script.md',
  scriptRevision: 7,
  readyTransitionId: null,
};

async function project(text: string) {
  return createPerformanceProjection({ canonicalText: text, canonicalUtf8Bytes: encoder.encode(text), sourceIdentity: SOURCE });
}

describe('performance-projection-v1', () => {
  test('preserves exact Unicode substrings with independent UTF-8 and UTF-16 offsets', async () => {
    const text = '[s1]\r\n“Café”—Joe’s 🍊 oranges repeat.\r\nOranges repeat.\r\n[/s1]\r\n';
    const result = await project(text);
    expect(result.tokenizerVersion).toBe(PERFORMANCE_TOKENIZER_VERSION);
    expect(result.algorithmVersion).toBe(PERFORMANCE_PROJECTION_ALGORITHM_VERSION);
    expect(result.words.map((word) => word.text)).toEqual([
      '“Café”—Joe’s', '🍊', 'oranges', 'repeat.', 'Oranges', 'repeat.',
    ]);
    expect(result.words[1]).toMatchObject({ text: '🍊', line: 1, column: 13 });
    for (const word of result.words) {
      const fromText = text.slice(word.startUtf16, word.endUtf16Exclusive);
      const fromBytes = new TextDecoder('utf-8', { fatal: true }).decode(
        encoder.encode(text).slice(word.startUtf8Byte, word.endUtf8ByteExclusive),
      );
      expect(fromText).toBe(word.text);
      expect(fromBytes).toBe(word.text);
      expect(Array.from(encoder.encode(fromText))).toEqual(
        Array.from(encoder.encode(text).slice(word.startUtf8Byte, word.endUtf8ByteExclusive)),
      );
    }
  });

  test.each([
    '[s1]\nPlain words.\n[/s1]\n',
    '[s1]\r\nCurly “quotes,” em—dashes, and déjà vu.\r\n[/s1]\r\n',
    '[s1]\nEmoji 🍊🙂 remain exact.\nThe same sentence.\nThe same sentence.\n[/s1]',
  ])('covers every eligible span once and reconstructs canonical spoken order', async (text) => {
    const result = await project(text);
    const eligible = result.ranges.filter((range) => range.kind === 'spoken_word');
    const sorted = [...result.words].sort((a, b) => a.startUtf16 - b.startUtf16);
    expect(sorted.map((word) => word.text)).toEqual(eligible.map((range) => range.text));
    expect(new Set(sorted.map((word) => `${word.startUtf16}:${word.endUtf16Exclusive}`)).size).toBe(sorted.length);
    expect(result.blocks.flatMap((block) => block.wordOrdinals)).toEqual(result.words.map((word) => word.ordinal));
  });

  test('classifies explicit directions and breaks without making them spoken words', async () => {
    const text = '[s1]\nFirst short line\ncontinues naturally.\n[pause]\nAfter pause.\n[/s1]\n[note]\nSmile at camera.\n[/note]\n[s2]\nSecond speaker.\n[/s2]\n';
    const result = await project(text);
    expect(result.words.map((word) => word.text)).not.toContain('Smile');
    expect(result.ranges.some((range) => range.kind === 'note_direction' && range.text.includes('Smile'))).toBe(true);
    expect(result.ranges.some((range) => range.kind === 'deliberate_pacing')).toBe(true);
    expect(result.blocks.map((block) => block.entryBreak)).toEqual([
      'speaker_transition', 'deliberate_pause', 'speaker_transition',
    ]);
  });

  test('groups short compatible lines and preserves explicit hard boundaries', async () => {
    const text = '[s1]\nOne short line\nthat belongs with this sentence.\n\nA separate paragraph begins here.\n[/s1]\n';
    const result = await project(text);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]?.text).toBe('One short line that belongs with this sentence.');
    expect(result.blocks[1]?.entryBreak).toBe('hard_break');
  });

  test('assigns distinct identities to repeated words and sentences', async () => {
    const result = await project('[s1]\nAgain again.\nAgain again.\n[/s1]\n');
    expect(new Set(result.words.map((word) => word.wordId)).size).toBe(result.words.length);
    expect(result.words[0]?.text).toBe(result.words[2]?.text);
    expect(result.words[0]?.wordId).not.toBe(result.words[2]?.wordId);
  });

  test('is golden deterministic for complete projection identities and boundaries', async () => {
    const text = '[s1]\r\n“Café” opens—brightly.\r\nA second short line follows.\r\n[beat]\r\nFinal 🍊 line.\r\n[/s1]\r\n';
    const first = await project(text);
    const second = await project(text);
    expect(second).toEqual(first);
    expect(first.source).toMatchObject({
      scriptRevision: 7,
      canonicalUtf8ByteLength: encoder.encode(text).length,
      canonicalUtf16Length: text.length,
    });
    expect(first.blocks.map((block) => ({
      ordinal: block.ordinal,
      text: block.text,
      entryBreak: block.entryBreak,
      wordOrdinals: block.wordOrdinals,
    }))).toEqual([
      { ordinal: 0, text: '“Café” opens—brightly. A second short line follows.', entryBreak: 'speaker_transition', wordOrdinals: [0, 1, 2, 3, 4, 5, 6] },
      { ordinal: 1, text: 'Final 🍊 line.', entryBreak: 'deliberate_pause', wordOrdinals: [7, 8, 9] },
    ]);
    expect(first.projectionId).toMatch(/^[0-9a-f]{64}$/);
    expect(first.blocks.every((block) => /^[0-9a-f]{64}$/.test(block.blockId))).toBe(true);
  });

  test('rejects invalid UTF-8 and byte/text/hash mismatches without a projection', async () => {
    await expect(createPerformanceProjection({
      canonicalText: '[s1]\nHello.\n[/s1]\n',
      canonicalUtf8Bytes: new Uint8Array([0xff]),
      sourceIdentity: SOURCE,
    })).rejects.toMatchObject({ code: 'INVALID_UTF8' });

    await expect(createPerformanceProjection({
      canonicalText: '[s1]\nHello.\n[/s1]\n',
      canonicalUtf8Bytes: encoder.encode('[s1]\nDifferent.\n[/s1]\n'),
      sourceIdentity: SOURCE,
    })).rejects.toMatchObject({ code: 'CANONICAL_BYTES_TEXT_MISMATCH' });

    await expect(createPerformanceProjection({
      canonicalText: '[s1]\nHello.\n[/s1]\n',
      canonicalUtf8Bytes: encoder.encode('[s1]\nHello.\n[/s1]\n'),
      sourceIdentity: { ...SOURCE, scriptHash: '0'.repeat(64) },
    })).rejects.toMatchObject({ code: 'CANONICAL_HASH_MISMATCH' });
  });

  test('rejects malformed or unsupported tag input loudly', async () => {
    await expect(project('[s1]\nHello [mystery].\n[/s1]\n')).rejects.toBeInstanceOf(PerformanceProjectionError);
    await expect(project('[s1]\nUnclosed.\n')).rejects.toMatchObject({ code: 'INVALID_SCRIPT_TAGS' });
    await expect(project('[s1]\nAmbiguous [ tag.\n[/s1]\n')).rejects.toMatchObject({ code: 'INVALID_SCRIPT_TAGS' });
  });

  test('fails loudly for deliberately omitted, duplicated, and reordered coverage', async () => {
    const text = '[s1]\nAlpha beta gamma.\n[/s1]\n';
    const bytes = encoder.encode(text);
    const valid = await project(text);

    await expect(assertPerformanceProjectionInvariants(
      { ...valid, words: valid.words.slice(0, -1) }, text, bytes,
    )).rejects.toMatchObject({ code: 'MISSING_SPOKEN_COVERAGE' });

    const duplicate = { ...valid.words[1]!, ordinal: valid.words.length };
    await expect(assertPerformanceProjectionInvariants(
      { ...valid, words: [...valid.words, duplicate] }, text, bytes,
    )).rejects.toMatchObject({ code: 'DUPLICATE_SPOKEN_COVERAGE' });

    const reordered = [
      { ...valid.words[1]!, ordinal: 0 },
      { ...valid.words[0]!, ordinal: 1 },
      ...valid.words.slice(2),
    ];
    await expect(assertPerformanceProjectionInvariants(
      { ...valid, words: reordered }, text, bytes,
    )).rejects.toMatchObject({ code: 'REORDERED_SPOKEN_COVERAGE' });
  });
});
