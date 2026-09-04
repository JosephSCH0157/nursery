import '../fs/recording-dir';
import {
  commitRecordingFileToTongs,
  ensureRecordingCaptureTarget,
  transitionRecordingCompleted,
  type AnvilCaptureAuthority,
} from '../forge/workpiece-commit';
import { showRecordingDecisionDialog } from './recording-decision-dialog';
import { transitionRecordingDiscarded, transitionRecordingKept } from '../forge/workpiece-commit';

export type ObsStopResult = { adapter: 'obs'; stopped: boolean; outputPath?: string };

type ImportState = {
  authority: AnvilCaptureAuthority | null;
  running: Promise<void> | null;
  lastStop: ObsStopResult | null;
  selectedFile: File | null;
};

const state: ImportState = { authority: null, running: null, lastStop: null, selectedFile: null };

function segments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
}

export function relativeObsOutputPath(outputPath: string, directoryName: string): string[] | null {
  const parts = segments(outputPath);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  const rootAt = parts.map((part) => part.toLowerCase()).lastIndexOf(directoryName.trim().toLowerCase());
  if (rootAt < 0 || rootAt === parts.length - 1) return null;
  return parts.slice(rootAt + 1);
}

async function resolveFromLinkedDirectory(outputPath: string): Promise<File | null> {
  await (window as any).__tpRecDir?.init?.();
  const root = (window as any).__tpRecDir?.get?.() as FileSystemDirectoryHandle | null;
  if (!root) return null;
  const permission = await (root as any).queryPermission?.({ mode: 'read' });
  if (permission !== 'granted') return null;
  const relative = relativeObsOutputPath(outputPath, root.name);
  if (!relative) return null;
  let directory = root;
  for (const part of relative.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  const handle = await directory.getFileHandle(relative[relative.length - 1]!);
  return handle.getFile();
}

async function selectFinishedFile(): Promise<File | null> {
  const picker = (window as any).showOpenFilePicker;
  if (typeof picker !== 'function') return null;
  try {
    const handles = await picker({ id: 'anvil-obs-finished-recording', multiple: false });
    return handles?.[0]?.getFile?.() ?? null;
  } catch {
    return null;
  }
}

function announce(name: string, detail: Record<string, unknown>): void {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch {}
}

export async function prepareObsRecordingImport(): Promise<boolean> {
  const target = await ensureRecordingCaptureTarget();
  state.authority = target.ok ? target.captureAuthority : null;
  return target.ok;
}

export async function importFinishedObsRecording(result: ObsStopResult): Promise<void> {
  state.lastStop = result;
  if (!result.stopped || !result.outputPath) {
    announce('tp:obs:recording-import', { phase: 'needs-file', reason: 'output_path_missing' });
    return;
  }
  let captureAuthority = state.authority;
  if (!captureAuthority) {
    const target = await ensureRecordingCaptureTarget();
    if (target.ok) captureAuthority = target.captureAuthority;
  }
  if (!captureAuthority) {
    announce('tp:obs:recording-import', { phase: 'failed', reason: 'capture_authority_missing' });
    return;
  }
  let file: File | null = state.selectedFile;
  state.selectedFile = null;
  if (!file) try { file = await resolveFromLinkedDirectory(result.outputPath); } catch {}
  if (!file) {
    announce('tp:obs:recording-import', { phase: 'needs-file', reason: 'local_file_permission_required', retryAvailable: true });
    return;
  }
  announce('tp:obs:recording-import', { phase: 'uploading', name: file.name, bytes: file.size });
  const committed = await commitRecordingFileToTongs({ file, originalName: file.name, captureAuthority });
  if (!committed.ok) {
    announce('tp:obs:recording-import', { phase: 'failed', reason: committed.reason, errorCode: committed.errorCode ?? null });
    return;
  }
  const completed = await transitionRecordingCompleted({ commit: committed });
  if (!completed.ok || !completed.completionId) {
    announce('tp:obs:recording-import', { phase: 'failed', reason: completed.reason ?? completed.outcome });
    return;
  }
  announce('tp:obs:recording-import', { phase: 'decision-required', completionId: completed.completionId });
  await showRecordingDecisionDialog({
    takeName: file.name,
    onKeep: async () => {
      const decision = await transitionRecordingKept({ commit: committed, completionId: completed.completionId! });
      if (!decision.ok) throw new Error(decision.reason ?? decision.outcome);
      announce('tp:obs:recording-import', { phase: 'kept', completionId: completed.completionId });
    },
    onDiscard: async () => {
      const decision = await transitionRecordingDiscarded({ commit: committed, completionId: completed.completionId! });
      if (!decision.ok) throw new Error(decision.reason ?? decision.outcome);
      announce('tp:obs:recording-import', { phase: 'discarded', completionId: completed.completionId });
    },
  });
}

export async function selectAndImportFinishedObsRecording(): Promise<void> {
  const file = await selectFinishedFile();
  if (!file) return;
  state.selectedFile = file;
  await importFinishedObsRecording(state.lastStop ?? { adapter: 'obs', stopped: true, outputPath: file.name });
}

function acceptStopResult(result: ObsStopResult): Promise<void> {
  if (state.running) return state.running;
  state.running = importFinishedObsRecording(result).finally(() => { state.running = null; });
  return state.running;
}

try {
  (window as any).__tpObsImport = {
    prepare: prepareObsRecordingImport,
    acceptStopResult,
    retryWithFilePicker: selectAndImportFinishedObsRecording,
  };
  window.addEventListener('rec:state', (event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.adapter === 'obs' && detail?.state === 'starting') void prepareObsRecordingImport();
  });
} catch {}
