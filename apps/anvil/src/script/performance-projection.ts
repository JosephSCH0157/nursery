export const PERFORMANCE_PROJECTION_SCHEMA = 'anvil.performance-script-projection.v1' as const;
export const PERFORMANCE_PROJECTION_ALGORITHM_VERSION = 'performance-projection-v1' as const;
export const PERFORMANCE_TOKENIZER_VERSION = 'forge-performance-tokenizer-v1' as const;

export type PerformanceBreak =
  | 'soft_continuation'
  | 'sentence_break'
  | 'deliberate_pause'
  | 'hard_break'
  | 'section_boundary'
  | 'speaker_transition';

export type PerformanceSpeakerId = 's1' | 's2' | 'guest1' | 'guest2';

export type PerformanceProjectionErrorCode =
  | 'INVALID_UTF8'
  | 'CANONICAL_BYTES_TEXT_MISMATCH'
  | 'CANONICAL_HASH_MISMATCH'
  | 'INVALID_SCRIPT_TAGS'
  | 'INVALID_SOURCE_OFFSETS'
  | 'UTF8_UTF16_SPAN_MISMATCH'
  | 'MISSING_SPOKEN_COVERAGE'
  | 'DUPLICATE_SPOKEN_COVERAGE'
  | 'OVERLAPPING_SPOKEN_COVERAGE'
  | 'REORDERED_SPOKEN_COVERAGE'
  | 'NONDETERMINISTIC_IDENTITY';

export class PerformanceProjectionError extends Error {
  readonly code: PerformanceProjectionErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: PerformanceProjectionErrorCode, details: Record<string, unknown> = {}) {
    super(`Performance projection rejected: ${code}`);
    this.name = 'PerformanceProjectionError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export type PerformanceSourceIdentity = {
  workspaceId: string;
  workpieceId: string;
  path: string;
  scriptRevision: number;
  scriptHash?: string;
  readyTransitionId?: string | null;
};

export type PerformanceSpokenWordV1 = {
  wordId: string;
  ordinal: number;
  text: string;
  startUtf8Byte: number;
  endUtf8ByteExclusive: number;
  startUtf16: number;
  endUtf16Exclusive: number;
  line: number;
  column: number;
  speakerId: PerformanceSpeakerId | null;
};

export type PerformanceBlockV1 = {
  blockId: string;
  screenAnchorId: string;
  ordinal: number;
  text: string;
  wordOrdinals: number[];
  sourceRanges: Array<{
    startUtf8Byte: number;
    endUtf8ByteExclusive: number;
    startUtf16: number;
    endUtf16Exclusive: number;
  }>;
  speakerId: PerformanceSpeakerId | null;
  entryBreak: PerformanceBreak;
  exitBreak: PerformanceBreak;
  displayHints: {
    preferredMaxLines: number;
    keepTogether: boolean;
    continuation: boolean;
  };
};

export type PerformanceClassifiedRangeV1 = {
  kind: 'spoken_word' | 'whitespace' | 'line_break' | 'speaker_transition' | 'note_direction' | 'deliberate_pacing' | 'control_tag';
  startUtf16: number;
  endUtf16Exclusive: number;
  text: string;
};

export type AnvilPerformanceProjectionV1 = {
  schema: typeof PERFORMANCE_PROJECTION_SCHEMA;
  projectionId: string;
  algorithmVersion: typeof PERFORMANCE_PROJECTION_ALGORITHM_VERSION;
  tokenizerVersion: typeof PERFORMANCE_TOKENIZER_VERSION;
  source: PerformanceSourceIdentity & {
    scriptHash: string;
    canonicalUtf8ByteLength: number;
    canonicalUtf16Length: number;
  };
  ranges: PerformanceClassifiedRangeV1[];
  words: PerformanceSpokenWordV1[];
  blocks: PerformanceBlockV1[];
  spokenWordCount: number;
  canonicalSpokenSequenceHash: string;
  validation: {
    exactWordSequencePreserved: true;
    completeSpokenSpanCoverage: true;
    nonOverlappingSourceRanges: true;
    utf8Utf16Agreement: true;
    deterministicIdentityVerified: true;
  };
};

type AtomicLine = {
  words: PerformanceSpokenWordV1[];
  speakerId: PerformanceSpeakerId | null;
  entryBreak: PerformanceBreak;
  endSentence: boolean;
};

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder('utf-8', { fatal: true });
const SPEAKER_OPEN: Record<string, PerformanceSpeakerId> = {
  '[s1]': 's1', '[s2]': 's2', '[g1]': 'guest1', '[g2]': 'guest2',
};
const SPEAKER_CLOSE = new Set(['[/s1]', '[/s2]', '[/g1]', '[/g2]']);
const PACING = new Set(['[pause]', '[beat]', '[reflective pause]']);
const TARGET_MIN_WORDS = 20;
const TARGET_MAX_WORDS = 60;
const TARGET_MAX_CHARS = 320;

function validateProjectionTags(text: string): string[] {
  const issues: string[] = [];
  let speaker: string | null = null;
  let inNote = false;
  for (const [lineIndex, line] of lineParts(text).entries()) {
    const raw = text.slice(line.start, line.end);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const tokens = raw.match(/\[[^\]]+\]/g) ?? [];
    const bracketResidue = tokens.reduce((value, token) => value.replace(token, ''), raw);
    if (bracketResidue.includes('[') || bracketResidue.includes(']')) {
      issues.push(`ambiguous_tag_delimiter:${lineIndex}`);
    }
    for (const tokenRaw of tokens) {
      const token = tokenRaw.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!SPEAKER_OPEN[token] && !SPEAKER_CLOSE.has(token) && token !== '[note]' && token !== '[/note]' && !PACING.has(token)) {
        issues.push(`unsupported_tag:${lineIndex}:${tokenRaw}`);
      }
    }
    const canonical = trimmed.toLowerCase().replace(/\s+/g, ' ');
    if (SPEAKER_OPEN[canonical]) {
      if (tokens.length !== 1 || trimmed !== tokens[0]) issues.push(`speaker_tag_not_own_line:${lineIndex}`);
      if (speaker || inNote) issues.push(`crossed_speaker_open:${lineIndex}`);
      speaker = canonical;
      continue;
    }
    if (SPEAKER_CLOSE.has(canonical)) {
      if (tokens.length !== 1 || trimmed !== tokens[0]) issues.push(`speaker_tag_not_own_line:${lineIndex}`);
      const expected = speaker ? `[/${speaker.slice(1)}` : null;
      if (!expected || canonical !== expected) issues.push(`unopened_or_crossed_speaker_close:${lineIndex}`);
      speaker = null;
      continue;
    }
    if (canonical === '[note]') {
      if (tokens.length !== 1 || trimmed !== tokens[0] || inNote) issues.push(`invalid_note_open:${lineIndex}`);
      inNote = true;
      continue;
    }
    if (canonical === '[/note]') {
      if (tokens.length !== 1 || trimmed !== tokens[0] || !inNote) issues.push(`invalid_note_close:${lineIndex}`);
      inNote = false;
      continue;
    }
    if (!speaker && !inNote) issues.push(`text_outside_speaker:${lineIndex}`);
    if (tokens.some((token) => PACING.has(token.trim().toLowerCase().replace(/\s+/g, ' '))) && !speaker) {
      issues.push(`pacing_outside_speaker:${lineIndex}`);
    }
  }
  if (speaker) issues.push('unclosed_speaker');
  if (inNote) issues.push('unclosed_note');
  return issues;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(row[key])}`).join(',')}}`;
}

async function sha256Hex(value: Uint8Array | string): Promise<string> {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  const digestInput = new Uint8Array(bytes).buffer;
  const digest = await crypto.subtle.digest('SHA-256', digestInput);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildUtf8BoundaryMap(text: string): number[] {
  const offsets = new Array<number>(text.length + 1).fill(-1);
  let utf16 = 0;
  let utf8 = 0;
  offsets[0] = 0;
  while (utf16 < text.length) {
    const codePoint = text.codePointAt(utf16);
    if (codePoint == null) break;
    const chunk = String.fromCodePoint(codePoint);
    const width16 = chunk.length;
    const width8 = encoder.encode(chunk).length;
    offsets[utf16] = utf8;
    utf16 += width16;
    utf8 += width8;
    offsets[utf16] = utf8;
  }
  return offsets;
}

function lineParts(text: string): Array<{ start: number; end: number; breakEnd: number }> {
  const result: Array<{ start: number; end: number; breakEnd: number }> = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '\r' && text[i] !== '\n') continue;
    const breakEnd = text[i] === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
    result.push({ start, end: i, breakEnd });
    i = breakEnd - 1;
    start = breakEnd;
  }
  result.push({ start, end: text.length, breakEnd: text.length });
  return result;
}

function isWhitespace(char: string): boolean {
  return /\s/u.test(char);
}

function assertBoundary(map: number[], offset: number): number {
  const byte = map[offset];
  if (!Number.isInteger(byte) || byte < 0) {
    throw new PerformanceProjectionError('INVALID_SOURCE_OFFSETS', { offset });
  }
  return byte;
}

function classifyAndTokenize(text: string, byteMap: number[]) {
  const ranges: PerformanceClassifiedRangeV1[] = [];
  const words: PerformanceSpokenWordV1[] = [];
  const atomicLines: AtomicLine[] = [];
  let speakerId: PerformanceSpeakerId | null = null;
  let inNote = false;
  let pendingBreak: PerformanceBreak = 'section_boundary';
  let logicalLine = 0;

  const addRange = (kind: PerformanceClassifiedRangeV1['kind'], start: number, end: number) => {
    if (end <= start) return;
    ranges.push({ kind, startUtf16: start, endUtf16Exclusive: end, text: text.slice(start, end) });
  };

  for (const line of lineParts(text)) {
    const raw = text.slice(line.start, line.end);
    const trimmed = raw.trim();
    const leftTrim = raw.length - raw.trimStart().length;
    const tagStart = line.start + leftTrim;
    const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');

    if (!trimmed) {
      addRange('whitespace', line.start, line.end);
      pendingBreak = 'hard_break';
    } else if (SPEAKER_OPEN[lower]) {
      addRange('whitespace', line.start, tagStart);
      addRange('speaker_transition', tagStart, tagStart + trimmed.length);
      addRange('whitespace', tagStart + trimmed.length, line.end);
      speakerId = SPEAKER_OPEN[lower];
      pendingBreak = 'speaker_transition';
    } else if (SPEAKER_CLOSE.has(lower)) {
      addRange('whitespace', line.start, tagStart);
      addRange('speaker_transition', tagStart, tagStart + trimmed.length);
      addRange('whitespace', tagStart + trimmed.length, line.end);
      speakerId = null;
      pendingBreak = 'speaker_transition';
    } else if (lower === '[note]') {
      addRange('note_direction', line.start, line.end);
      inNote = true;
      pendingBreak = 'hard_break';
    } else if (lower === '[/note]') {
      addRange('note_direction', line.start, line.end);
      inNote = false;
      pendingBreak = 'hard_break';
    } else if (inNote) {
      addRange('note_direction', line.start, line.end);
    } else {
      const lineWords: PerformanceSpokenWordV1[] = [];
      let cursor = line.start;
      while (cursor < line.end) {
        if (isWhitespace(text[cursor]!)) {
          const start = cursor;
          while (cursor < line.end && isWhitespace(text[cursor]!)) cursor += 1;
          addRange('whitespace', start, cursor);
          continue;
        }
        if (text[cursor] === '[') {
          const close = text.indexOf(']', cursor + 1);
          if (close >= 0 && close < line.end) {
            const end = close + 1;
            const tag = text.slice(cursor, end).trim().toLowerCase().replace(/\s+/g, ' ');
            addRange(PACING.has(tag) ? 'deliberate_pacing' : 'control_tag', cursor, end);
            if (PACING.has(tag)) pendingBreak = 'deliberate_pause';
            cursor = end;
            continue;
          }
        }
        const start = cursor;
        while (cursor < line.end && !isWhitespace(text[cursor]!) && text[cursor] !== '[') {
          const cp = text.codePointAt(cursor)!;
          cursor += cp > 0xffff ? 2 : 1;
        }
        const end = cursor;
        const word: PerformanceSpokenWordV1 = {
          wordId: '', ordinal: words.length, text: text.slice(start, end),
          startUtf8Byte: assertBoundary(byteMap, start),
          endUtf8ByteExclusive: assertBoundary(byteMap, end),
          startUtf16: start, endUtf16Exclusive: end,
          line: logicalLine,
          column: start - line.start,
          speakerId,
        };
        words.push(word);
        lineWords.push(word);
        addRange('spoken_word', start, end);
      }
      if (lineWords.length) {
        const finalText = lineWords[lineWords.length - 1]!.text;
        atomicLines.push({
          words: lineWords,
          speakerId,
          entryBreak: pendingBreak,
          endSentence: /[.!?]["'’”)}\]]*$/.test(finalText),
        });
        pendingBreak = 'soft_continuation';
      }
    }
    if (line.breakEnd > line.end) addRange('line_break', line.end, line.breakEnd);
    logicalLine += 1;
  }
  ranges.sort((a, b) => a.startUtf16 - b.startUtf16);
  return { ranges, words, atomicLines };
}

function shouldForceBoundary(kind: PerformanceBreak): boolean {
  return kind === 'deliberate_pause' || kind === 'hard_break' || kind === 'section_boundary' || kind === 'speaker_transition';
}

async function buildBlocks(lines: AtomicLine[], sourceHash: string): Promise<PerformanceBlockV1[]> {
  const groups: Array<{ lines: AtomicLine[]; entryBreak: PerformanceBreak }> = [];
  let current: AtomicLine[] = [];
  const close = () => {
    if (!current.length) return;
    groups.push({ lines: current, entryBreak: current[0]!.entryBreak });
    current = [];
  };
  for (const line of lines) {
    if (current.length && (shouldForceBoundary(line.entryBreak) || line.speakerId !== current[0]!.speakerId)) close();
    current.push(line);
    const words = current.flatMap((entry) => entry.words);
    const chars = words.reduce((sum, word) => sum + word.text.length, 0) + Math.max(0, words.length - 1);
    if (words.length >= TARGET_MAX_WORDS || chars >= TARGET_MAX_CHARS || (words.length >= TARGET_MIN_WORDS && line.endSentence)) close();
  }
  close();

  return Promise.all(groups.map(async (group, ordinal) => {
    const words = group.lines.flatMap((line) => line.words);
    const nextEntry = groups[ordinal + 1]?.entryBreak;
    const exitBreak: PerformanceBreak = nextEntry ?? (group.lines[group.lines.length - 1]!.endSentence ? 'sentence_break' : 'section_boundary');
    const identity = {
      sourceHash,
      algorithmVersion: PERFORMANCE_PROJECTION_ALGORITHM_VERSION,
      tokenizerVersion: PERFORMANCE_TOKENIZER_VERSION,
      ordinal,
      ranges: words.map((word) => [word.startUtf8Byte, word.endUtf8ByteExclusive, word.startUtf16, word.endUtf16Exclusive]),
      entryBreak: group.entryBreak,
      exitBreak,
    };
    const blockId = await sha256Hex(canonicalJson(identity));
    return {
      blockId,
      screenAnchorId: `performance-block-${blockId.slice(0, 24)}`,
      ordinal,
      text: words.map((word) => word.text).join(' '),
      wordOrdinals: words.map((word) => word.ordinal),
      sourceRanges: words.map((word) => ({
        startUtf8Byte: word.startUtf8Byte,
        endUtf8ByteExclusive: word.endUtf8ByteExclusive,
        startUtf16: word.startUtf16,
        endUtf16Exclusive: word.endUtf16Exclusive,
      })),
      speakerId: group.lines[0]!.speakerId,
      entryBreak: group.entryBreak,
      exitBreak,
      displayHints: { preferredMaxLines: 4, keepTogether: true, continuation: group.entryBreak === 'soft_continuation' },
    };
  }));
}

function fail(code: PerformanceProjectionErrorCode, details: Record<string, unknown> = {}): never {
  throw new PerformanceProjectionError(code, details);
}

async function validateProjectionSpans(text: string, bytes: Uint8Array, words: PerformanceSpokenWordV1[]): Promise<void> {
  let priorEnd16 = -1;
  let priorEnd8 = -1;
  let priorStart16 = -1;
  let priorStart8 = -1;
  const seen = new Set<string>();
  for (let ordinal = 0; ordinal < words.length; ordinal += 1) {
    const word = words[ordinal]!;
    if (word.ordinal !== ordinal) fail('REORDERED_SPOKEN_COVERAGE', { ordinal });
    if (word.startUtf16 < 0 || word.endUtf16Exclusive > text.length || word.startUtf16 >= word.endUtf16Exclusive
      || word.startUtf8Byte < 0 || word.endUtf8ByteExclusive > bytes.length || word.startUtf8Byte >= word.endUtf8ByteExclusive) {
      fail('INVALID_SOURCE_OFFSETS', { ordinal });
    }
    const key = `${word.startUtf16}:${word.endUtf16Exclusive}`;
    if (seen.has(key)) fail('DUPLICATE_SPOKEN_COVERAGE', { ordinal });
    seen.add(key);
    if (word.startUtf16 < priorStart16 || word.startUtf8Byte < priorStart8) fail('REORDERED_SPOKEN_COVERAGE', { ordinal });
    if (word.startUtf16 < priorEnd16 || word.startUtf8Byte < priorEnd8) fail('OVERLAPPING_SPOKEN_COVERAGE', { ordinal });
    const fromText = text.slice(word.startUtf16, word.endUtf16Exclusive);
    let fromBytes: string;
    try { fromBytes = strictDecoder.decode(bytes.slice(word.startUtf8Byte, word.endUtf8ByteExclusive)); }
    catch { fail('UTF8_UTF16_SPAN_MISMATCH', { ordinal }); }
    if (fromText !== word.text || fromBytes !== word.text) fail('UTF8_UTF16_SPAN_MISMATCH', { ordinal });
    const reencoded = encoder.encode(fromText);
    const byteSlice = bytes.slice(word.startUtf8Byte, word.endUtf8ByteExclusive);
    if (reencoded.length !== byteSlice.length || reencoded.some((value, index) => value !== byteSlice[index])) {
      fail('UTF8_UTF16_SPAN_MISMATCH', { ordinal });
    }
    priorEnd16 = word.endUtf16Exclusive;
    priorEnd8 = word.endUtf8ByteExclusive;
    priorStart16 = word.startUtf16;
    priorStart8 = word.startUtf8Byte;
  }
}

export async function assertPerformanceProjectionInvariants(
  projection: Pick<AnvilPerformanceProjectionV1, 'source' | 'ranges' | 'words' | 'blocks'>,
  canonicalText: string,
  canonicalUtf8Bytes: Uint8Array,
): Promise<void> {
  let decoded: string;
  try { decoded = strictDecoder.decode(canonicalUtf8Bytes); }
  catch { fail('INVALID_UTF8'); }
  if (decoded !== canonicalText) fail('CANONICAL_BYTES_TEXT_MISMATCH');
  const actualHash = await sha256Hex(canonicalUtf8Bytes);
  if (projection.source.scriptHash.toLowerCase() !== actualHash) {
    fail('CANONICAL_HASH_MISMATCH', { expected: projection.source.scriptHash, actual: actualHash });
  }
  await validateProjectionSpans(canonicalText, canonicalUtf8Bytes, projection.words);
  const eligible = projection.ranges.filter((range) => range.kind === 'spoken_word');
  if (projection.words.length < eligible.length) fail('MISSING_SPOKEN_COVERAGE');
  if (projection.words.length > eligible.length) fail('DUPLICATE_SPOKEN_COVERAGE');
  for (let ordinal = 0; ordinal < eligible.length; ordinal += 1) {
    const range = eligible[ordinal]!;
    const word = projection.words[ordinal]!;
    if (range.startUtf16 !== word.startUtf16 || range.endUtf16Exclusive !== word.endUtf16Exclusive || range.text !== word.text) {
      fail('MISSING_SPOKEN_COVERAGE', { ordinal });
    }
  }
  const flattened = projection.blocks.flatMap((block) => block.wordOrdinals);
  if (flattened.length !== projection.words.length || flattened.some((ordinal, index) => ordinal !== index)) {
    fail('REORDERED_SPOKEN_COVERAGE');
  }
}

export async function createPerformanceProjection(input: {
  canonicalText: string;
  canonicalUtf8Bytes: Uint8Array;
  sourceIdentity: PerformanceSourceIdentity;
}): Promise<AnvilPerformanceProjectionV1> {
  let decoded: string;
  try { decoded = strictDecoder.decode(input.canonicalUtf8Bytes); }
  catch { fail('INVALID_UTF8'); }
  if (decoded !== input.canonicalText) fail('CANONICAL_BYTES_TEXT_MISMATCH');
  const scriptHash = await sha256Hex(input.canonicalUtf8Bytes);
  if (input.sourceIdentity.scriptHash && input.sourceIdentity.scriptHash.toLowerCase() !== scriptHash) {
    fail('CANONICAL_HASH_MISMATCH', { expected: input.sourceIdentity.scriptHash, actual: scriptHash });
  }
  const tagIssues = validateProjectionTags(input.canonicalText);
  if (tagIssues.length) fail('INVALID_SCRIPT_TAGS', { issues: tagIssues });

  const byteMap = buildUtf8BoundaryMap(input.canonicalText);
  if (assertBoundary(byteMap, input.canonicalText.length) !== input.canonicalUtf8Bytes.length) fail('INVALID_SOURCE_OFFSETS');
  const parsed = classifyAndTokenize(input.canonicalText, byteMap);
  await validateProjectionSpans(input.canonicalText, input.canonicalUtf8Bytes, parsed.words);

  const eligibleRanges = parsed.ranges.filter((range) => range.kind === 'spoken_word');
  if (eligibleRanges.length !== parsed.words.length) fail('MISSING_SPOKEN_COVERAGE');
  for (let i = 0; i < eligibleRanges.length; i += 1) {
    const range = eligibleRanges[i]!;
    const word = parsed.words[i]!;
    if (range.startUtf16 !== word.startUtf16 || range.endUtf16Exclusive !== word.endUtf16Exclusive || range.text !== word.text) {
      fail('MISSING_SPOKEN_COVERAGE', { ordinal: i });
    }
  }

  for (const word of parsed.words) {
    word.wordId = await sha256Hex(canonicalJson({
      sourceHash: scriptHash,
      tokenizerVersion: PERFORMANCE_TOKENIZER_VERSION,
      startUtf8Byte: word.startUtf8Byte,
      endUtf8ByteExclusive: word.endUtf8ByteExclusive,
      startUtf16: word.startUtf16,
      endUtf16Exclusive: word.endUtf16Exclusive,
    }));
  }
  const blocks = await buildBlocks(parsed.atomicLines, scriptHash);
  const flattened = blocks.flatMap((block) => block.wordOrdinals);
  if (flattened.length !== parsed.words.length || flattened.some((ordinal, index) => ordinal !== index)) {
    fail('REORDERED_SPOKEN_COVERAGE');
  }
  const canonicalSpokenSequenceHash = await sha256Hex(canonicalJson(parsed.words.map((word) => word.text)));
  const projectionBasis = {
    source: { ...input.sourceIdentity, scriptHash },
    tokenizerVersion: PERFORMANCE_TOKENIZER_VERSION,
    algorithmVersion: PERFORMANCE_PROJECTION_ALGORITHM_VERSION,
    blockIds: blocks.map((block) => block.blockId),
    wordIds: parsed.words.map((word) => word.wordId),
  };
  const projectionId = await sha256Hex(canonicalJson(projectionBasis));

  const projection: AnvilPerformanceProjectionV1 = {
    schema: PERFORMANCE_PROJECTION_SCHEMA,
    projectionId,
    algorithmVersion: PERFORMANCE_PROJECTION_ALGORITHM_VERSION,
    tokenizerVersion: PERFORMANCE_TOKENIZER_VERSION,
    source: {
      ...input.sourceIdentity,
      scriptHash,
      canonicalUtf8ByteLength: input.canonicalUtf8Bytes.length,
      canonicalUtf16Length: input.canonicalText.length,
    },
    ranges: parsed.ranges,
    words: parsed.words,
    blocks,
    spokenWordCount: parsed.words.length,
    canonicalSpokenSequenceHash,
    validation: {
      exactWordSequencePreserved: true,
      completeSpokenSpanCoverage: true,
      nonOverlappingSourceRanges: true,
      utf8Utf16Agreement: true,
      deterministicIdentityVerified: true,
    },
  };
  await assertPerformanceProjectionInvariants(projection, input.canonicalText, input.canonicalUtf8Bytes);
  return projection;
}
