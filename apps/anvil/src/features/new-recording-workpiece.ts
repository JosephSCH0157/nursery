import { fetchAuthenticatedTongs } from '../forge/tongs-user-auth';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type CreationResult = { outcome: 'created' | 'existing'; workpiece_id: string };
type EphemeralTeleprompterSnapshot = { editorValue: string; renderedHtml: string; viewerScrollTop: number; titleValue: string };

const uuid = (value: unknown): string | null => typeof value === 'string' && UUID_RE.test(value.trim()) ? value.trim().toLowerCase() : null;

function resolveWorkspaceId(): string | null {
  const query = new URLSearchParams(window.location.search);
  return uuid(query.get('workspace_id') ?? query.get('workspaceId'))
    ?? uuid((window as any).__forgeWorkspaceId)
    ?? uuid(localStorage.getItem('forge_workspace_id_v1'))
    ?? uuid(localStorage.getItem('barstock_workspace_id'));
}

export function snapshotEphemeralTeleprompterState(): EphemeralTeleprompterSnapshot {
  return {
    editorValue: (document.getElementById('editor') as HTMLTextAreaElement | null)?.value ?? '',
    renderedHtml: document.getElementById('script')?.innerHTML ?? '',
    viewerScrollTop: (document.getElementById('viewer') as HTMLElement | null)?.scrollTop ?? 0,
    titleValue: (document.getElementById('scriptTitle') as HTMLInputElement | null)?.value ?? '',
  };
}

export function restoreEphemeralTeleprompterState(snapshot: EphemeralTeleprompterSnapshot): void {
  const editor = document.getElementById('editor') as HTMLTextAreaElement | null;
  const rendered = document.getElementById('script');
  const viewer = document.getElementById('viewer') as HTMLElement | null;
  const title = document.getElementById('scriptTitle') as HTMLInputElement | null;
  if (editor) editor.value = snapshot.editorValue;
  if (rendered) rendered.innerHTML = snapshot.renderedHtml;
  if (viewer) viewer.scrollTop = snapshot.viewerScrollTop;
  if (title) title.value = snapshot.titleValue;
}

export async function createNewRecordingWorkpiece(titleInput: string, operationKey?: string): Promise<CreationResult> {
  const workspaceId = resolveWorkspaceId();
  if (!workspaceId) throw new Error('workspace_context_required');
  const title = titleInput.trim();
  if (!title || title.length > 200) throw new Error('invalid_episode_title');
  const resolvedOperationKey = operationKey
    ?? sessionStorage.getItem('forge_anvil_pending_workpiece_creation_v1')
    ?? `recording-workpiece:anvil:${crypto.randomUUID()}`;
  const snapshot = snapshotEphemeralTeleprompterState();
  sessionStorage.setItem('forge_anvil_pending_workpiece_creation_v1', resolvedOperationKey);
  const response = await fetchAuthenticatedTongs(`/tongs/workspaces/${encodeURIComponent(workspaceId)}/recording-workpieces`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title, origin_venue: 'anvil', operation_key: resolvedOperationKey }),
  });
  const envelope = await response.json() as { data?: CreationResult; error?: { code?: string; message?: string } };
  if (!response.ok || !envelope.data || !['created', 'existing'].includes(envelope.data.outcome) || !uuid(envelope.data.workpiece_id)) {
    if (!response.ok) sessionStorage.removeItem('forge_anvil_pending_workpiece_creation_v1');
    throw new Error(envelope.error?.code ?? 'recording_workpiece_creation_failed');
  }
  const workpieceId = envelope.data.workpiece_id.toLowerCase();
  const route = new URL(window.location.href);
  route.searchParams.set('workspace_id', workspaceId);
  route.searchParams.set('workpiece_id', workpieceId);
  history.replaceState({ ...(history.state ?? {}), forgeWorkpieceRebind: true }, '', route);
  (window as any).__forgeWorkspaceId = workspaceId;
  (window as any).__forgeWorkpieceId = workpieceId;
  delete (window as any).__forgeCanonicalScriptIdentity;
  delete (window as any).__forgeCanonicalReadyScript;
  localStorage.setItem('forge_workspace_id_v1', workspaceId);
  localStorage.setItem('forge_active_workpiece_id_v1', workpieceId);
  sessionStorage.removeItem('forge_anvil_pending_workpiece_creation_v1');
  restoreEphemeralTeleprompterState(snapshot);
  window.dispatchEvent(new CustomEvent('forge:recording-workpiece:created', { detail: { workspaceId, workpieceId, originVenue: 'anvil' } }));
  return { outcome: envelope.data.outcome, workpiece_id: workpieceId };
}

export function initNewRecordingWorkpieceEntry(): void {
  const anchor = document.getElementById('scriptRefreshBtn');
  if (!anchor || document.getElementById('newRecordingWorkpieceBtn')) return;
  const button = document.createElement('button');
  button.id = 'newRecordingWorkpieceBtn';
  button.type = 'button';
  button.textContent = 'New recording';
  button.title = 'Create a canonical episode for a new recording';
  anchor.insertAdjacentElement('afterend', button);
  button.addEventListener('click', async () => {
    const entered = window.prompt('Name this new recording');
    if (entered == null) return;
    const title = entered.trim();
    if (!title || title.length > 200) {
      (window as any).toast?.('Enter a title between 1 and 200 characters.', { type: 'error' });
      return;
    }
    button.disabled = true;
    try {
      await createNewRecordingWorkpiece(title);
      (window as any).toast?.('Episode created. Press Record when you are ready.', { type: 'success' });
    } catch (error) {
      (window as any).toast?.(`Could not create the episode: ${error instanceof Error ? error.message : String(error)}`, { type: 'error' });
    } finally {
      button.disabled = false;
    }
  });
}
