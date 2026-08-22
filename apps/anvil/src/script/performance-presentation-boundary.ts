import {
  createPerformanceProjection,
  type AnvilPerformanceProjectionV1,
  type PerformanceSourceIdentity,
} from './performance-projection';

export const PERFORMANCE_PRESENTATION_MODE = 'performance-projection-v1' as const;
export const LEGACY_PRESENTATION_MODE = 'legacy' as const;

export type CanonicalScriptIdentity = PerformanceSourceIdentity & {
  scriptHash: string;
};

export type PresentationDiagnosticCode =
  | 'UNKNOWN_PRESENTATION'
  | 'MISSING_CANONICAL_IDENTITY'
  | 'INVALID_CANONICAL_REVISION'
  | 'INVALID_CANONICAL_HASH'
  | 'PREPARATION_FAILED'
  | 'PREPARED_SOURCE_STALE'
  | 'PRESENTATION_NOT_ACTIVE'
  | 'ACTIVE_PRESENTATION_INVALID';

export type PresentationDiagnostic = Readonly<{
  code: PresentationDiagnosticCode;
  message: string;
  requestedValue: string | null;
  source: CanonicalScriptIdentity | null;
  causeCode?: string;
}>;

export class PresentationBoundaryError extends Error {
  readonly diagnostic: PresentationDiagnostic;

  constructor(diagnostic: PresentationDiagnostic) {
    super(diagnostic.message);
    this.name = 'PresentationBoundaryError';
    this.diagnostic = diagnostic;
  }
}

export type RequestedPresentation =
  | Readonly<{ status: 'current'; mode: typeof LEGACY_PRESENTATION_MODE; explicit: false }>
  | Readonly<{ status: 'requested'; mode: typeof PERFORMANCE_PRESENTATION_MODE; explicit: true }>;

export type PreparedPresentation = Readonly<{
  status: 'prepared';
  mode: typeof PERFORMANCE_PRESENTATION_MODE;
  source: CanonicalScriptIdentity;
  projection: AnvilPerformanceProjectionV1;
}>;

/** HA-4 may create this only after its renderer has atomically installed the projection. */
export type ActivePresentation = Readonly<{
  status: 'active';
  mode: typeof PERFORMANCE_PRESENTATION_MODE;
  source: CanonicalScriptIdentity;
  projection: AnvilPerformanceProjectionV1;
  activation: Readonly<{
    schema: 'anvil.performance-presentation-installation.v1';
    rendererVersion: 'performance-projection-renderer-v1';
    projectionId: string;
    installationEpoch: string;
    presentationGeneration: number;
    installedBlockCount: number;
    installedWordCount: number;
    orderedAnchorIntegrityHash: string;
    orderedWordMappingHash: string;
    rootIdentity: string;
    sourceScriptRevision: number;
    sourceScriptHash: string;
  }>;
}>;

export type PerformancePresentationState = RequestedPresentation | PreparedPresentation | ActivePresentation;

export type ActivePresentationEvidence = Readonly<{
  mode: typeof PERFORMANCE_PRESENTATION_MODE;
  projection_schema: AnvilPerformanceProjectionV1['schema'];
  projection_id: string;
  algorithm_version: string;
  tokenizer_version: string;
  source_script_hash: string;
  source_script_revision: number;
}>;

const SHA256_RE = /^[0-9a-f]{64}$/;

function diagnostic(
  code: PresentationDiagnosticCode,
  message: string,
  requestedValue: string | null,
  source: CanonicalScriptIdentity | null,
  causeCode?: string,
): PresentationDiagnostic {
  return Object.freeze({ code, message, requestedValue, source, ...(causeCode ? { causeCode } : {}) });
}

export function parseRequestedPresentation(search: string | URLSearchParams): RequestedPresentation {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search;
  const values = params.getAll('presentation');
  if (values.length === 0) {
    return Object.freeze({ status: 'current', mode: LEGACY_PRESENTATION_MODE, explicit: false });
  }
  const raw = values[0] ?? '';
  if (values.length !== 1) {
    throw new PresentationBoundaryError(diagnostic(
      'UNKNOWN_PRESENTATION', 'Presentation selection must occur exactly once.', raw, null,
    ));
  }
  if (raw !== PERFORMANCE_PRESENTATION_MODE) {
    throw new PresentationBoundaryError(diagnostic(
      'UNKNOWN_PRESENTATION',
      `Unsupported explicit presentation selection: ${raw}`,
      raw,
      null,
    ));
  }
  return Object.freeze({ status: 'requested', mode: PERFORMANCE_PRESENTATION_MODE, explicit: true });
}

function requireCanonicalIdentity(value: CanonicalScriptIdentity | null | undefined): CanonicalScriptIdentity {
  if (!value || !value.workspaceId?.trim() || !value.workpieceId?.trim() || !value.path?.trim()) {
    throw new PresentationBoundaryError(diagnostic(
      'MISSING_CANONICAL_IDENTITY', 'Authenticated canonical script identity is required.',
      PERFORMANCE_PRESENTATION_MODE, null,
    ));
  }
  if (!Number.isInteger(value.scriptRevision) || value.scriptRevision <= 0) {
    throw new PresentationBoundaryError(diagnostic(
      'INVALID_CANONICAL_REVISION', 'Canonical script revision must be a positive integer.',
      PERFORMANCE_PRESENTATION_MODE, value,
    ));
  }
  const hash = value.scriptHash.toLowerCase();
  if (!SHA256_RE.test(hash)) {
    throw new PresentationBoundaryError(diagnostic(
      'INVALID_CANONICAL_HASH', 'Canonical script hash must be a SHA-256 hex digest.',
      PERFORMANCE_PRESENTATION_MODE, value,
    ));
  }
  return Object.freeze({ ...value, scriptHash: hash });
}

export async function prepareRequestedPresentation(input: {
  requestedPresentation: RequestedPresentation;
  canonicalIdentity?: CanonicalScriptIdentity | null;
  canonicalText: string;
  canonicalUtf8Bytes: Uint8Array;
}): Promise<PreparedPresentation | null> {
  if (input.requestedPresentation.status === 'current') return null;
  const source = requireCanonicalIdentity(input.canonicalIdentity);
  try {
    const projection = await createPerformanceProjection({
      canonicalText: input.canonicalText,
      canonicalUtf8Bytes: input.canonicalUtf8Bytes,
      sourceIdentity: source,
    });
    return Object.freeze({ status: 'prepared', mode: PERFORMANCE_PRESENTATION_MODE, source, projection });
  } catch (error) {
    if (error instanceof PresentationBoundaryError) throw error;
    const causeCode = typeof error === 'object' && error && 'code' in error ? String(error.code) : undefined;
    throw new PresentationBoundaryError(diagnostic(
      'PREPARATION_FAILED', 'Performance presentation preparation failed; no projection state was produced.',
      PERFORMANCE_PRESENTATION_MODE, source, causeCode,
    ));
  }
}

export function assertPreparedPresentationFresh(
  prepared: PreparedPresentation,
  canonicalIdentity: CanonicalScriptIdentity | null | undefined,
): void {
  const current = requireCanonicalIdentity(canonicalIdentity);
  const source = prepared.source;
  if (source.workspaceId !== current.workspaceId || source.workpieceId !== current.workpieceId
    || source.path !== current.path || source.scriptRevision !== current.scriptRevision
    || source.scriptHash !== current.scriptHash) {
    throw new PresentationBoundaryError(diagnostic(
      'PREPARED_SOURCE_STALE', 'Prepared presentation no longer matches the canonical script identity.',
      PERFORMANCE_PRESENTATION_MODE, current,
    ));
  }
}

export function serializeActivePresentationEvidence(state: PerformancePresentationState): ActivePresentationEvidence {
  if (state.status !== 'active') {
    throw new PresentationBoundaryError(diagnostic(
      'PRESENTATION_NOT_ACTIVE', 'Only an active, installed presentation may produce capture evidence.',
      state.mode, 'source' in state ? state.source : null,
    ));
  }
  const projection = state.projection;
  if (state.activation.schema !== 'anvil.performance-presentation-installation.v1'
    || state.activation.rendererVersion !== 'performance-projection-renderer-v1'
    || state.activation.projectionId !== projection.projectionId
    || state.activation.installedBlockCount !== projection.blocks.length
    || state.activation.installedWordCount !== projection.words.length
    || !SHA256_RE.test(state.activation.orderedAnchorIntegrityHash)
    || !SHA256_RE.test(state.activation.orderedWordMappingHash)
    || state.activation.sourceScriptHash !== state.source.scriptHash
    || state.activation.sourceScriptRevision !== state.source.scriptRevision
    || projection.source.scriptHash !== state.source.scriptHash
    || projection.source.scriptRevision !== state.source.scriptRevision) {
    throw new PresentationBoundaryError(diagnostic(
      'ACTIVE_PRESENTATION_INVALID', 'Active presentation does not prove installation of this canonical projection.',
      state.mode, state.source,
    ));
  }
  return Object.freeze({
    mode: state.mode,
    projection_schema: projection.schema,
    projection_id: projection.projectionId,
    algorithm_version: projection.algorithmVersion,
    tokenizer_version: projection.tokenizerVersion,
    source_script_hash: state.source.scriptHash,
    source_script_revision: state.source.scriptRevision,
  });
}
