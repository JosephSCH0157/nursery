import type {
  AnvilPerformanceProjectionV1,
  PerformanceBlockV1,
  PerformanceSpokenWordV1,
} from './performance-projection';
import type { PreparedPresentation } from './performance-presentation-boundary';

export const PERFORMANCE_PRESENTATION_RENDERER_VERSION = 'performance-projection-renderer-v1' as const;
export const PERFORMANCE_PRESENTATION_DOM_BUDGET = Object.freeze({
  maxNodesPerBlock: 2,
  maxWordSpansAtRest: 0,
  maxHtmlBytesPerCanonicalCharacter: 2,
});

export type PerformanceWordAnchorMapping = Readonly<{
  wordId: string;
  wordOrdinal: number;
  blockId: string;
  blockOrdinal: number;
  screenAnchorId: string;
  canonicalLine: number;
  startUtf8Byte: number;
  endUtf8ByteExclusive: number;
  startUtf16: number;
  endUtf16Exclusive: number;
}>;

export type PerformanceBlockAnchorMapping = Readonly<{
  blockId: string;
  blockOrdinal: number;
  screenAnchorId: string;
  wordOrdinals: readonly number[];
  canonicalLines: readonly number[];
}>;

export type PerformancePresentationCandidate = Readonly<{
  schema: 'anvil.performance-presentation-candidate.v1';
  rendererVersion: typeof PERFORMANCE_PRESENTATION_RENDERER_VERSION;
  projectionId: string;
  sourceScriptRevision: number;
  sourceScriptHash: string;
  fragment: DocumentFragment;
  blockElements: readonly HTMLElement[];
  wordElements: readonly HTMLElement[];
  blockMappings: readonly PerformanceBlockAnchorMapping[];
  wordMappings: readonly PerformanceWordAnchorMapping[];
  canonicalLineToBlockOrdinals: Readonly<Record<string, readonly number[]>>;
  integrity: Readonly<{
    blockCount: number;
    wordCount: number;
    orderedAnchorIntegrityHash: string;
    orderedWordMappingHash: string;
  }>;
  diagnostics: Readonly<{
    projectionBuildMs: number;
    nodeCount: number;
    wordSpanCount: number;
    generatedHtmlBytes: number;
  }>;
}>;

export type PerformancePresentationBuildErrorCode =
  | 'INVALID_PREPARED_PRESENTATION'
  | 'INVALID_BLOCK_ORDER'
  | 'INVALID_WORD_ORDER'
  | 'DUPLICATE_BLOCK_ID'
  | 'DUPLICATE_ANCHOR_ID'
  | 'DUPLICATE_WORD_ID'
  | 'INVALID_BLOCK_WORD_MAPPING'
  | 'INVALID_BLOCK_TEXT';

export class PerformancePresentationBuildError extends Error {
  readonly code: PerformancePresentationBuildErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: PerformancePresentationBuildErrorCode, details: Record<string, unknown> = {}) {
    super(`Performance presentation candidate rejected: ${code}`);
    this.name = 'PerformancePresentationBuildError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

const encoder = new TextEncoder();

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

async function sha256Hex(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fail(code: PerformancePresentationBuildErrorCode, details: Record<string, unknown> = {}): never {
  throw new PerformancePresentationBuildError(code, details);
}

function validateProjection(projection: AnvilPerformanceProjectionV1): void {
  const blockIds = new Set<string>();
  const anchorIds = new Set<string>();
  const wordIds = new Set<string>();
  projection.words.forEach((word, ordinal) => {
    if (word.ordinal !== ordinal) fail('INVALID_WORD_ORDER', { ordinal, actual: word.ordinal });
    if (wordIds.has(word.wordId)) fail('DUPLICATE_WORD_ID', { wordId: word.wordId });
    wordIds.add(word.wordId);
  });
  const flattened: number[] = [];
  projection.blocks.forEach((block, ordinal) => {
    if (block.ordinal !== ordinal) fail('INVALID_BLOCK_ORDER', { ordinal, actual: block.ordinal });
    if (blockIds.has(block.blockId)) fail('DUPLICATE_BLOCK_ID', { blockId: block.blockId });
    if (anchorIds.has(block.screenAnchorId)) fail('DUPLICATE_ANCHOR_ID', { screenAnchorId: block.screenAnchorId });
    blockIds.add(block.blockId);
    anchorIds.add(block.screenAnchorId);
    const words = block.wordOrdinals.map((wordOrdinal) => projection.words[wordOrdinal]);
    if (words.some((word) => !word)) fail('INVALID_BLOCK_WORD_MAPPING', { blockOrdinal: ordinal });
    const expectedText = (words as PerformanceSpokenWordV1[]).map((word) => word.text).join(' ');
    if (block.text !== expectedText) fail('INVALID_BLOCK_TEXT', { blockOrdinal: ordinal });
    flattened.push(...block.wordOrdinals);
  });
  if (flattened.length !== projection.words.length || flattened.some((ordinal, index) => ordinal !== index)) {
    fail('INVALID_BLOCK_WORD_MAPPING');
  }
}

function createBlockElement(
  ownerDocument: Document,
  block: PerformanceBlockV1,
): { blockElement: HTMLElement; wordElements: HTMLElement[] } {
  const blockElement = ownerDocument.createElement('div');
  const ordinal = String(block.ordinal);
  blockElement.className = 'line tp-performance-block';
  blockElement.id = block.screenAnchorId;
  blockElement.dataset.i = ordinal;
  blockElement.dataset.index = ordinal;
  blockElement.dataset.line = ordinal;
  blockElement.dataset.lineIdx = ordinal;
  blockElement.dataset.performanceBlockId = block.blockId;
  blockElement.dataset.performanceBlockOrdinal = ordinal;
  blockElement.dataset.screenAnchorId = block.screenAnchorId;
  blockElement.dataset.entryBreak = block.entryBreak;
  blockElement.dataset.exitBreak = block.exitBreak;
  if (block.speakerId) blockElement.dataset.speaker = block.speakerId;

  blockElement.appendChild(ownerDocument.createTextNode(block.text));
  return { blockElement, wordElements: [] };
}

export function serializePerformancePresentation(candidate: Pick<PerformancePresentationCandidate, 'blockElements'>): string {
  return candidate.blockElements.map((element) => element.outerHTML).join('');
}

export async function buildDetachedPerformancePresentation(input: {
  preparedPresentation: PreparedPresentation;
  ownerDocument?: Document;
}): Promise<PerformancePresentationCandidate> {
  const prepared = input.preparedPresentation;
  const buildStartedAt = performance.now();
  if (prepared.status !== 'prepared' || prepared.mode !== 'performance-projection-v1'
    || prepared.projection.projectionId.length !== 64
    || prepared.projection.source.scriptRevision !== prepared.source.scriptRevision
    || prepared.projection.source.scriptHash !== prepared.source.scriptHash) {
    fail('INVALID_PREPARED_PRESENTATION');
  }
  validateProjection(prepared.projection);
  const ownerDocument = input.ownerDocument ?? document;
  const fragment = ownerDocument.createDocumentFragment();
  const blockElements: HTMLElement[] = [];
  const wordElements: HTMLElement[] = [];
  const blockMappings: PerformanceBlockAnchorMapping[] = [];
  const wordMappings: PerformanceWordAnchorMapping[] = [];
  const lineMap = new Map<number, number[]>();

  for (const block of prepared.projection.blocks) {
    const words = block.wordOrdinals.map((ordinal) => prepared.projection.words[ordinal]!);
    const built = createBlockElement(ownerDocument, block);
    fragment.appendChild(built.blockElement);
    blockElements.push(built.blockElement);
    wordElements.push(...built.wordElements);
    const canonicalLines = [...new Set(words.map((word) => word.line))];
    blockMappings.push(Object.freeze({
      blockId: block.blockId,
      blockOrdinal: block.ordinal,
      screenAnchorId: block.screenAnchorId,
      wordOrdinals: Object.freeze([...block.wordOrdinals]),
      canonicalLines: Object.freeze(canonicalLines),
    }));
    words.forEach((word) => {
      const existing = lineMap.get(word.line) ?? [];
      if (!existing.includes(block.ordinal)) existing.push(block.ordinal);
      lineMap.set(word.line, existing);
      wordMappings.push(Object.freeze({
        wordId: word.wordId,
        wordOrdinal: word.ordinal,
        blockId: block.blockId,
        blockOrdinal: block.ordinal,
        screenAnchorId: block.screenAnchorId,
        canonicalLine: word.line,
        startUtf8Byte: word.startUtf8Byte,
        endUtf8ByteExclusive: word.endUtf8ByteExclusive,
        startUtf16: word.startUtf16,
        endUtf16Exclusive: word.endUtf16Exclusive,
      }));
    });
  }

  const canonicalLineToBlockOrdinals = Object.freeze(Object.fromEntries(
    [...lineMap.entries()].sort(([a], [b]) => a - b).map(([line, ordinals]) => [String(line), Object.freeze([...ordinals])]),
  ));
  const anchorBasis = blockMappings.map((mapping) => ({
    blockId: mapping.blockId,
    blockOrdinal: mapping.blockOrdinal,
    screenAnchorId: mapping.screenAnchorId,
  }));
  const wordBasis = wordMappings.map((mapping) => ({ ...mapping }));
  const [orderedAnchorIntegrityHash, orderedWordMappingHash] = await Promise.all([
    sha256Hex(anchorBasis),
    sha256Hex(wordBasis),
  ]);

  return Object.freeze({
    schema: 'anvil.performance-presentation-candidate.v1',
    rendererVersion: PERFORMANCE_PRESENTATION_RENDERER_VERSION,
    projectionId: prepared.projection.projectionId,
    sourceScriptRevision: prepared.source.scriptRevision,
    sourceScriptHash: prepared.source.scriptHash,
    fragment,
    blockElements: Object.freeze(blockElements),
    wordElements: Object.freeze(wordElements),
    blockMappings: Object.freeze(blockMappings),
    wordMappings: Object.freeze(wordMappings),
    canonicalLineToBlockOrdinals,
    integrity: Object.freeze({
      blockCount: blockElements.length,
      wordCount: prepared.projection.words.length,
      orderedAnchorIntegrityHash,
      orderedWordMappingHash,
    }),
    diagnostics: Object.freeze({
      projectionBuildMs: performance.now() - buildStartedAt,
      nodeCount: blockElements.length * 2,
      wordSpanCount: 0,
      generatedHtmlBytes: encoder.encode(blockElements.map((element) => element.outerHTML).join('')).length,
    }),
  });
}
