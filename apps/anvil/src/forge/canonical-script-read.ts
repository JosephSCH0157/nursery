import { fetchAuthenticatedTongs, ForgeUserAuthorizationError } from './tongs-user-auth';

export type CanonicalScriptReadResult =
  | { ok: true; text: string; revision: number; hash: string }
  | { ok: false; reason: 'not_found' | 'unauthorized' | 'request_failed' | 'invalid_response'; status?: number };

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export async function readCanonicalScriptFile(
  workpieceId: string,
  path: string,
  headersInit?: HeadersInit,
): Promise<CanonicalScriptReadResult> {
  let response: Response;
  try {
    response = await fetchAuthenticatedTongs(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(path)}`,
      { method: 'GET', headers: headersInit },
    );
  } catch (error) {
    if (error instanceof ForgeUserAuthorizationError) {
      return { ok: false, reason: 'unauthorized', status: 401 };
    }
    return { ok: false, reason: 'request_failed' };
  }

  if (response.status === 404) return { ok: false, reason: 'not_found', status: 404 };
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'unauthorized', status: response.status };
  }
  if (!response.ok) return { ok: false, reason: 'request_failed', status: response.status };

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: 'invalid_response', status: response.status };
  }
  if (!body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) {
    return { ok: false, reason: 'invalid_response', status: response.status };
  }

  const root = body as { data?: unknown; file_row?: unknown };
  if (typeof root.data !== 'string') {
    return { ok: false, reason: 'invalid_response', status: response.status };
  }
  const fileRow = root.file_row && typeof root.file_row === 'object'
    ? root.file_row as Record<string, unknown>
    : null;
  const revision = typeof fileRow?.revision === 'number' && Number.isInteger(fileRow.revision)
    ? fileRow.revision
    : 0;
  const hash = readString(fileRow?.hash_value)?.toLowerCase() ?? '';
  if (revision < 1 || !/^[0-9a-f]{64}$/.test(hash)) {
    return { ok: false, reason: 'invalid_response', status: response.status };
  }
  return { ok: true, text: root.data, revision, hash };
}
