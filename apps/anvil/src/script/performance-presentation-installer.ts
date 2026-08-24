import {
  assertPreparedPresentationFresh,
  type ActivePresentation,
  type CanonicalScriptIdentity,
  type PreparedPresentation,
} from './performance-presentation-boundary';
import type { PerformancePresentationCandidate } from './performance-presentation-builder';
import { registerCommittedPresentationMirror } from './performance-presentation-mirror-observer';
import {
  beginPresentationMutationTransaction,
  commitPresentationMutationTransaction,
  finishPresentationMutationTransaction,
  rollBackPresentationMutationTransaction,
  type PresentationMutationTransaction,
} from './performance-presentation-mutation-transaction';

export type PerformancePresentationInstallErrorCode =
  | 'PREPARED_STATE_NOT_AUTHORIZED'
  | 'CANONICAL_SOURCE_STALE'
  | 'PRESENTATION_GENERATION_STALE'
  | 'CANDIDATE_MISMATCH'
  | 'ATTACHED_VALIDATION_FAILED'
  | 'INSTALLATION_FAILED'
  | 'ACTIVE_RECEIPT_STALE';

export class PerformancePresentationInstallError extends Error {
  readonly code: PerformancePresentationInstallErrorCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: PerformancePresentationInstallErrorCode, details: Record<string, unknown> = {}) {
    super(`Performance presentation installation rejected: ${code}`);
    this.name = 'PerformancePresentationInstallError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

export class PerformancePresentationAuthority {
  private canonicalIdentity: CanonicalScriptIdentity;
  private generationValue = 1;
  private preparedValue: PreparedPresentation | null = null;
  private activeValue: ActivePresentation | null = null;

  constructor(canonicalIdentity: CanonicalScriptIdentity) {
    this.canonicalIdentity = Object.freeze({ ...canonicalIdentity, scriptHash: canonicalIdentity.scriptHash.toLowerCase() });
  }

  get generation(): number { return this.generationValue; }
  get canonical(): CanonicalScriptIdentity { return this.canonicalIdentity; }
  get prepared(): PreparedPresentation | null { return this.preparedValue; }
  get active(): ActivePresentation | null { return this.activeValue; }

  authorizePrepared(prepared: PreparedPresentation): number {
    assertPreparedPresentationFresh(prepared, this.canonicalIdentity);
    this.preparedValue = prepared;
    return this.generationValue;
  }

  invalidateForScriptGeneration(canonicalIdentity: CanonicalScriptIdentity): number {
    this.generationValue += 1;
    this.canonicalIdentity = Object.freeze({ ...canonicalIdentity, scriptHash: canonicalIdentity.scriptHash.toLowerCase() });
    this.preparedValue = null;
    this.activeValue = null;
    return this.generationValue;
  }

  commitActive(active: ActivePresentation, expectedGeneration: number): void {
    if (this.generationValue !== expectedGeneration || this.preparedValue?.projection.projectionId !== active.projection.projectionId) {
      throw new PerformancePresentationInstallError('PRESENTATION_GENERATION_STALE');
    }
    this.activeValue = active;
  }

  restoreActive(active: ActivePresentation | null): void {
    this.activeValue = active;
  }
}

type RootSnapshot = {
  children: Node[];
  attributes: Array<[string, string]>;
  scrollTop: number;
  scrollLeft: number;
};

let installationCounter = 0;

function snapshotRoot(root: HTMLElement): RootSnapshot {
  return {
    children: Array.from(root.childNodes),
    attributes: Array.from(root.attributes).map((attribute) => [attribute.name, attribute.value]),
    scrollTop: root.scrollTop,
    scrollLeft: root.scrollLeft,
  };
}

function restoreRoot(root: HTMLElement, snapshot: RootSnapshot): void {
  root.replaceChildren(...snapshot.children);
  for (const attribute of Array.from(root.attributes)) root.removeAttribute(attribute.name);
  for (const [name, value] of snapshot.attributes) root.setAttribute(name, value);
  root.scrollTop = snapshot.scrollTop;
  root.scrollLeft = snapshot.scrollLeft;
}

function sameCanonical(left: CanonicalScriptIdentity, right: CanonicalScriptIdentity): boolean {
  return left.workspaceId === right.workspaceId && left.workpieceId === right.workpieceId
    && left.path === right.path && left.scriptRevision === right.scriptRevision
    && left.scriptHash === right.scriptHash;
}

function validateCandidate(prepared: PreparedPresentation, candidate: PerformancePresentationCandidate): void {
  if (candidate.projectionId !== prepared.projection.projectionId
    || candidate.sourceScriptRevision !== prepared.source.scriptRevision
    || candidate.sourceScriptHash !== prepared.source.scriptHash
    || candidate.integrity.blockCount !== prepared.projection.blocks.length
    || candidate.integrity.wordCount !== prepared.projection.words.length
    || candidate.fragment.childNodes.length !== candidate.integrity.blockCount
    || candidate.blockElements.some((element) => element.isConnected || element.parentNode !== candidate.fragment)
    || candidate.wordElements.some((element) => element.isConnected)) {
    throw new PerformancePresentationInstallError('CANDIDATE_MISMATCH');
  }
}

function createEpoch(): string {
  installationCounter += 1;
  let nonce = '';
  try { nonce = crypto.randomUUID?.() ?? ''; } catch {}
  if (!nonce) nonce = `${Date.now().toString(36)}-${installationCounter.toString(36)}`;
  return `performance-install-${installationCounter}-${nonce}`;
}

function validateAttached(
  root: HTMLElement,
  candidate: PerformancePresentationCandidate,
  epoch: string,
): void {
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(':scope > .tp-performance-block'));
  const words = Array.from(root.querySelectorAll<HTMLElement>('.tp-performance-word'));
  if (blocks.length !== candidate.integrity.blockCount || words.length !== candidate.wordElements.length
    || root.dataset.performanceProjectionId !== candidate.projectionId
    || root.dataset.presentationEpoch !== epoch) {
    throw new PerformancePresentationInstallError('ATTACHED_VALIDATION_FAILED', { stage: 'counts_or_root' });
  }
  for (let index = 0; index < candidate.blockMappings.length; index += 1) {
    const mapping = candidate.blockMappings[index]!;
    const element = blocks[index];
    if (!element || element !== candidate.blockElements[index] || !element.isConnected
      || element.parentElement !== root || element.id !== mapping.screenAnchorId
      || element.dataset.performanceBlockId !== mapping.blockId
      || element.dataset.performanceBlockOrdinal !== String(mapping.blockOrdinal)
      || element.dataset.presentationEpoch !== epoch) {
      throw new PerformancePresentationInstallError('ATTACHED_VALIDATION_FAILED', { stage: 'block', index });
    }
  }
  if (candidate.wordElements.length !== 0 || words.length !== 0) {
    throw new PerformancePresentationInstallError('ATTACHED_VALIDATION_FAILED', { stage: 'unexpected_word_dom' });
  }
}

export async function installPerformancePresentation(input: {
  authority: PerformancePresentationAuthority;
  preparedPresentation: PreparedPresentation;
  candidate: PerformancePresentationCandidate;
  root: HTMLElement;
  expectedGeneration: number;
  fault?: (stage: 'after-replace' | 'before-receipt') => void;
  transactionHooks?: Readonly<{
    beforeActiveCommit: () => void;
    afterActiveCommit: (active: ActivePresentation) => void;
    rollBack: () => void;
  }>;
  onMetrics?: (metrics: Readonly<{
    domInsertionMs: number;
    installedTreeValidationMs: number;
    mirrorSerializationMs: number;
    mirrorHtmlBytes: number;
  }>) => void;
}): Promise<ActivePresentation> {
  const { authority, preparedPresentation: prepared, candidate, root } = input;
  if (authority.prepared !== prepared) throw new PerformancePresentationInstallError('PREPARED_STATE_NOT_AUTHORIZED');
  if (authority.generation !== input.expectedGeneration) throw new PerformancePresentationInstallError('PRESENTATION_GENERATION_STALE');
  try { assertPreparedPresentationFresh(prepared, authority.canonical); }
  catch { throw new PerformancePresentationInstallError('CANONICAL_SOURCE_STALE'); }
  validateCandidate(prepared, candidate);

  const canonicalAtCommit = authority.canonical;
  const snapshot = snapshotRoot(root);
  const previousActive = authority.active;
  const epoch = createEpoch();
  const rootIdentity = root.id || root.dataset.role || 'anonymous-script-root';
  let mutationTransaction: PresentationMutationTransaction | null = null;
  let runtimeCommitStarted = false;
  let domInsertionMs = 0;
  let installedTreeValidationMs = 0;
  try {
    mutationTransaction = beginPresentationMutationTransaction(root, epoch);
    candidate.blockElements.forEach((element) => { element.dataset.presentationEpoch = epoch; });
    candidate.wordElements.forEach((element) => { element.dataset.presentationEpoch = epoch; });
    const insertionStartedAt = performance.now();
    root.replaceChildren(candidate.fragment);
    domInsertionMs = performance.now() - insertionStartedAt;
    root.dataset.performanceProjectionId = candidate.projectionId;
    root.dataset.presentationEpoch = epoch;
    root.dataset.lineCount = String(candidate.integrity.blockCount);
    input.fault?.('after-replace');
    if (authority.generation !== input.expectedGeneration || !sameCanonical(authority.canonical, canonicalAtCommit)) {
      throw new PerformancePresentationInstallError('PRESENTATION_GENERATION_STALE');
    }
    const validationStartedAt = performance.now();
    validateAttached(root, candidate, epoch);
    input.fault?.('before-receipt');
    validateAttached(root, candidate, epoch);
    installedTreeValidationMs = performance.now() - validationStartedAt;
    const active: ActivePresentation = Object.freeze({
      status: 'active', mode: 'performance-projection-v1', source: prepared.source, projection: prepared.projection,
      activation: Object.freeze({
        schema: 'anvil.performance-presentation-installation.v1',
        rendererVersion: candidate.rendererVersion,
        projectionId: candidate.projectionId,
        installationEpoch: epoch,
        presentationGeneration: input.expectedGeneration,
        installedBlockCount: candidate.integrity.blockCount,
        installedWordCount: candidate.integrity.wordCount,
        orderedAnchorIntegrityHash: candidate.integrity.orderedAnchorIntegrityHash,
        orderedWordMappingHash: candidate.integrity.orderedWordMappingHash,
        rootIdentity,
        sourceScriptRevision: prepared.source.scriptRevision,
        sourceScriptHash: prepared.source.scriptHash,
      }),
    });
    runtimeCommitStarted = true;
    input.transactionHooks?.beforeActiveCommit();
    authority.commitActive(active, input.expectedGeneration);
    input.transactionHooks?.afterActiveCommit(active);
    const mirrorMetrics = registerCommittedPresentationMirror(root, candidate);
    input.onMetrics?.({ domInsertionMs, installedTreeValidationMs, mirrorSerializationMs: mirrorMetrics.serializationMs, mirrorHtmlBytes: mirrorMetrics.htmlBytes });
    commitPresentationMutationTransaction(mutationTransaction);
    await Promise.resolve();
    return active;
  } catch (error) {
    if (mutationTransaction) rollBackPresentationMutationTransaction(mutationTransaction);
    restoreRoot(root, snapshot);
    if (authority.generation === input.expectedGeneration) authority.restoreActive(previousActive);
    if (runtimeCommitStarted) input.transactionHooks?.rollBack();
    for (const element of candidate.blockElements) candidate.fragment.appendChild(element);
    await Promise.resolve();
    if (error instanceof PerformancePresentationInstallError) throw error;
    throw new PerformancePresentationInstallError('INSTALLATION_FAILED', { reason: String(error) });
  } finally {
    if (mutationTransaction) finishPresentationMutationTransaction(mutationTransaction);
  }
}

export function assertActivePresentationReceiptLive(input: {
  authority: PerformancePresentationAuthority;
  active: ActivePresentation;
  root: HTMLElement;
}): void {
  const { authority, active, root } = input;
  const receipt = active.activation;
  const blocks = root.querySelectorAll(':scope > .tp-performance-block');
  const words = root.querySelectorAll('.tp-performance-word');
  if (authority.active !== active || authority.generation !== receipt.presentationGeneration
    || !sameCanonical(authority.canonical, active.source)
    || root.dataset.performanceProjectionId !== receipt.projectionId
    || root.dataset.presentationEpoch !== receipt.installationEpoch
    || blocks.length !== receipt.installedBlockCount || words.length !== 0
    || Array.from(blocks).some((element, index) => {
      const block = active.projection.blocks[index];
      const htmlElement = element as HTMLElement;
      return !block || htmlElement.dataset.presentationEpoch !== receipt.installationEpoch
        || htmlElement.dataset.performanceBlockId !== block.blockId
        || htmlElement.id !== block.screenAnchorId
        || htmlElement.textContent !== block.text;
    })) {
    throw new PerformancePresentationInstallError('ACTIVE_RECEIPT_STALE');
  }
}
