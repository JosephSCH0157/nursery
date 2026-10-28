const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ProductionScriptFailureReason =
  | 'not_found'
  | 'unauthorized'
  | 'request_failed'
  | 'invalid_response';

export type ParsedProductionScript = {
  text: string;
  revision: number;
  hash: string;
  readyTransitionId: string;
  scriptApprovalId: string;
  scriptApprovalRevision: number;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const candidate = readString(value);
  return candidate && UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

export function shouldAutoloadWorkpieceScript(search: string): boolean {
  const params = new URLSearchParams(search || '');
  const readParam = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = readString(params.get(key));
      if (value) return value;
    }
    return null;
  };

  const open = readParam('open', 'intent', 'action')?.toLowerCase();
  if (open === 'script' || open === 'script_primary') return true;
  if (readParam('script_path', 'path')) return true;

  // Only explicit URL identity grants handoff intent. Cached/window workpiece
  // continuity is intentionally outside this pure decision.
  return Boolean(normalizeUuid(
    readParam('workpiece_id', 'workpieceId', 'workpiece', 'cradle_id', 'cradleId'),
  ));
}

export function classifyProductionScriptHttpFailure(
  status: number,
  responseOk: boolean,
): ProductionScriptFailureReason | null {
  if (responseOk) return null;
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'unauthorized';
  return 'request_failed';
}

export function parseProductionScriptPayload(body: unknown): ParsedProductionScript | null {
  const data = body && typeof body === 'object'
    && (body as { ok?: unknown }).ok === true
    && (body as { data?: unknown }).data
    && typeof (body as { data?: unknown }).data === 'object'
    ? (body as { data: Record<string, unknown> }).data
    : null;
  const text = typeof data?.script_text === 'string' ? data.script_text : '';
  const revision = Number(data?.source_file_revision);
  const hash = readString(data?.script_content_hash)?.toLowerCase() ?? '';
  const readyTransitionId = normalizeUuid(data?.ready_transition_id);
  const scriptApprovalId = normalizeUuid(data?.script_approval_id);
  const scriptApprovalRevision = Number(data?.script_approval_revision);
  if (!text || !Number.isInteger(revision) || revision < 1 || !/^[0-9a-f]{64}$/.test(hash)
    || !readyTransitionId || !scriptApprovalId
    || !Number.isInteger(scriptApprovalRevision) || scriptApprovalRevision < 1) {
    return null;
  }
  return { text, revision, hash, readyTransitionId, scriptApprovalId, scriptApprovalRevision };
}
