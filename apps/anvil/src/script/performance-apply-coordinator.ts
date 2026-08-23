import {
  type ActivePresentation,
  type CanonicalScriptIdentity,
  type RequestedPresentation,
  prepareRequestedPresentation,
} from './performance-presentation-boundary';
import { buildDetachedPerformancePresentation } from './performance-presentation-builder';
import {
  installPerformancePresentation,
  type PerformancePresentationAuthority,
} from './performance-presentation-installer';

export const PERFORMANCE_DISPLAY_POLICY = Object.freeze({
  canonicalRawPublication: 'suppressed',
  renderedMirrorPublication: 'committed-only',
}) as Readonly<{
  canonicalRawPublication: 'suppressed';
  renderedMirrorPublication: 'committed-only';
}>;

export type PerformanceApplySource = 'workpiece-handoff' | 'ready-script';
export type PerformanceApplyStageFault =
  | 'before-prepare'
  | 'after-prepare'
  | 'after-build'
  | 'before-runtime-snapshot'
  | 'installer-after-replace'
  | 'installer-before-receipt'
  | 'after-runtime-commit'
  | 'before-committed-event';

export type StagedPerformanceApply = Readonly<{
  schema: 'anvil.performance-apply-stage.v1';
  requestedPresentation: RequestedPresentation;
  authenticated: boolean;
  source: PerformanceApplySource;
  canonicalIdentity: CanonicalScriptIdentity;
  canonicalText: string;
  canonicalUtf8Bytes: readonly number[];
  scrollMode: string;
  presentationGeneration: number;
}>;

export type PerformanceRuntimeCommit = Readonly<{
  canonicalText: string;
  canonicalIdentity: CanonicalScriptIdentity;
  activePresentation: ActivePresentation | null;
  displayPolicy: typeof PERFORMANCE_DISPLAY_POLICY;
}>;

export type PerformanceApplyCoordinatorAdapters<TSnapshot> = Readonly<{
  runtime: Readonly<{
    snapshot: () => TSnapshot;
    commit: (value: PerformanceRuntimeCommit) => void;
    restore: (snapshot: TSnapshot) => void;
  }>;
  events: Readonly<{
    publishProjectionCommitted: (detail: Readonly<{
      schema: 'anvil.performance-presentation-committed.v1';
      projectionId: string;
      installationEpoch: string;
      sourceScriptRevision: number;
      sourceScriptHash: string;
      displayPolicy: typeof PERFORMANCE_DISPLAY_POLICY;
    }>) => void;
  }>;
}>;

export type PerformanceApplyCoordinatorResult =
  | Readonly<{ outcome: 'legacy-bypass'; displayPolicy: 'legacy-unchanged' }>
  | Readonly<{ outcome: 'projection-committed'; activePresentation: ActivePresentation; displayPolicy: typeof PERFORMANCE_DISPLAY_POLICY }>;

export type PerformanceApplyCoordinatorErrorCode =
  | 'AUTHENTICATED_SOURCE_REQUIRED'
  | 'ASR_SCROLL_MODE_UNSUPPORTED'
  | 'PRESENTATION_GENERATION_STALE'
  | 'COORDINATED_APPLY_FAILED';

export class PerformanceApplyCoordinatorError extends Error {
  readonly code: PerformanceApplyCoordinatorErrorCode;
  readonly stage: string;
  readonly causeCode?: string;

  constructor(code: PerformanceApplyCoordinatorErrorCode, stage: string, causeCode?: string) {
    super(`Performance apply coordinator rejected: ${code} at ${stage}`);
    this.name = 'PerformanceApplyCoordinatorError';
    this.code = code;
    this.stage = stage;
    this.causeCode = causeCode;
  }
}

export function createStagedPerformanceApply(input: {
  requestedPresentation: RequestedPresentation;
  authenticated: boolean;
  source: PerformanceApplySource;
  canonicalIdentity: CanonicalScriptIdentity;
  canonicalText: string;
  canonicalUtf8Bytes: Uint8Array;
  scrollMode: string;
  presentationGeneration: number;
}): StagedPerformanceApply {
  return Object.freeze({
    schema: 'anvil.performance-apply-stage.v1',
    requestedPresentation: Object.freeze({ ...input.requestedPresentation }),
    authenticated: input.authenticated,
    source: input.source,
    canonicalIdentity: Object.freeze({ ...input.canonicalIdentity, scriptHash: input.canonicalIdentity.scriptHash.toLowerCase() }),
    canonicalText: input.canonicalText,
    canonicalUtf8Bytes: Object.freeze(Array.from(input.canonicalUtf8Bytes)),
    scrollMode: String(input.scrollMode || '').toLowerCase(),
    presentationGeneration: input.presentationGeneration,
  });
}

function injectedFault(fault: ((stage: PerformanceApplyStageFault) => void) | undefined, stage: PerformanceApplyStageFault): void {
  fault?.(stage);
}

export async function coordinateStagedPerformanceApply<TSnapshot>(input: {
  stage: StagedPerformanceApply;
  authority: PerformancePresentationAuthority;
  root: HTMLElement;
  adapters: PerformanceApplyCoordinatorAdapters<TSnapshot>;
  fault?: (stage: PerformanceApplyStageFault) => void;
}): Promise<PerformanceApplyCoordinatorResult> {
  const { stage, authority, adapters } = input;
  if (stage.requestedPresentation.status === 'current') {
    return Object.freeze({ outcome: 'legacy-bypass', displayPolicy: 'legacy-unchanged' });
  }
  if (!stage.authenticated || (stage.source !== 'workpiece-handoff' && stage.source !== 'ready-script')) {
    throw new PerformanceApplyCoordinatorError('AUTHENTICATED_SOURCE_REQUIRED', 'eligibility');
  }
  if (stage.scrollMode === 'asr' || stage.scrollMode === 'hybrid') {
    throw new PerformanceApplyCoordinatorError('ASR_SCROLL_MODE_UNSUPPORTED', 'eligibility');
  }
  if (authority.generation !== stage.presentationGeneration) {
    throw new PerformanceApplyCoordinatorError('PRESENTATION_GENERATION_STALE', 'initial-generation');
  }

  let currentStage = 'before-prepare';
  try {
    injectedFault(input.fault, 'before-prepare');
    const prepared = await prepareRequestedPresentation({
      requestedPresentation: stage.requestedPresentation,
      canonicalIdentity: stage.canonicalIdentity,
      canonicalText: stage.canonicalText,
      canonicalUtf8Bytes: Uint8Array.from(stage.canonicalUtf8Bytes),
    });
    if (!prepared) throw new Error('explicit performance presentation did not prepare');
    currentStage = 'after-prepare';
    injectedFault(input.fault, 'after-prepare');
    if (authority.generation !== stage.presentationGeneration) {
      throw new PerformanceApplyCoordinatorError('PRESENTATION_GENERATION_STALE', 'after-prepare');
    }
    const candidate = await buildDetachedPerformancePresentation({ preparedPresentation: prepared });
    currentStage = 'after-build';
    injectedFault(input.fault, 'after-build');
    if (authority.generation !== stage.presentationGeneration) {
      throw new PerformanceApplyCoordinatorError('PRESENTATION_GENERATION_STALE', 'after-build');
    }
    const authorizedGeneration = authority.authorizePrepared(prepared);
    if (authorizedGeneration !== stage.presentationGeneration) {
      throw new PerformanceApplyCoordinatorError('PRESENTATION_GENERATION_STALE', 'authorization');
    }
    currentStage = 'before-runtime-snapshot';
    injectedFault(input.fault, 'before-runtime-snapshot');
    const runtimeSnapshot = adapters.runtime.snapshot();
    let committedActive: ActivePresentation | null = null;
    const active = await installPerformancePresentation({
      authority,
      preparedPresentation: prepared,
      candidate,
      root: input.root,
      expectedGeneration: stage.presentationGeneration,
      fault: (installerStage) => {
        const coordinatorStage = installerStage === 'after-replace'
          ? 'installer-after-replace'
          : 'installer-before-receipt';
        currentStage = coordinatorStage;
        injectedFault(input.fault, coordinatorStage);
      },
      transactionHooks: {
        beforeActiveCommit: () => {
          adapters.runtime.commit({
            canonicalText: stage.canonicalText,
            canonicalIdentity: stage.canonicalIdentity,
            activePresentation: null,
            displayPolicy: PERFORMANCE_DISPLAY_POLICY,
          });
          currentStage = 'after-runtime-commit';
          injectedFault(input.fault, 'after-runtime-commit');
        },
        afterActiveCommit: (nextActive) => {
          committedActive = nextActive;
          adapters.runtime.commit({
            canonicalText: stage.canonicalText,
            canonicalIdentity: stage.canonicalIdentity,
            activePresentation: nextActive,
            displayPolicy: PERFORMANCE_DISPLAY_POLICY,
          });
          currentStage = 'before-committed-event';
          injectedFault(input.fault, 'before-committed-event');
          adapters.events.publishProjectionCommitted(Object.freeze({
            schema: 'anvil.performance-presentation-committed.v1',
            projectionId: nextActive.projection.projectionId,
            installationEpoch: nextActive.activation.installationEpoch,
            sourceScriptRevision: nextActive.source.scriptRevision,
            sourceScriptHash: nextActive.source.scriptHash,
            displayPolicy: PERFORMANCE_DISPLAY_POLICY,
          }));
        },
        rollBack: () => {
          committedActive = null;
          adapters.runtime.restore(runtimeSnapshot);
        },
      },
    });
    if (committedActive !== active) throw new Error('coordinator active commit mismatch');
    return Object.freeze({ outcome: 'projection-committed', activePresentation: active, displayPolicy: PERFORMANCE_DISPLAY_POLICY });
  } catch (error) {
    if (error instanceof PerformanceApplyCoordinatorError) throw error;
    const causeCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
    throw new PerformanceApplyCoordinatorError('COORDINATED_APPLY_FAILED', currentStage, causeCode);
  }
}
