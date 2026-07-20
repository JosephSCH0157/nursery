export type CanonicalReadyScriptIdentity = {
  workspaceId: string;
  workpieceId: string;
  path: string;
  scriptRevision: number;
  scriptHash: string;
  transitionId: string;
};

export type CanonicalAsrSnapshot = {
  schema: 'anvil.asr-authority-snapshot.v1';
  cursor: number;
  coveredLines: number[];
  unresolvedSkippedLines: number[];
  pendingRecoveryProposal: { target: number; reason: string; proposedAt: number } | null;
  semanticProgressAt: number | null;
  terminalCompleted: boolean;
  postrollEligible: boolean;
  captureSessionId: string | null;
  readyScript: CanonicalReadyScriptIdentity | null;
};

const STORAGE_KEY = 'anvil_asr_authority_snapshot_v1';

function readReadyScript(): CanonicalReadyScriptIdentity | null {
  const value = (window as Window & { __forgeCanonicalReadyScript?: unknown }).__forgeCanonicalReadyScript;
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  return typeof row.workspaceId === 'string' && typeof row.workpieceId === 'string'
    && typeof row.path === 'string' && typeof row.scriptRevision === 'number'
    && typeof row.scriptHash === 'string' && typeof row.transitionId === 'string'
    ? row as CanonicalReadyScriptIdentity
    : null;
}

function readCaptureSessionId(): string | null {
  const value = (window as Window & { __tpAnvilCaptureSessionId?: unknown }).__tpAnvilCaptureSessionId;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export class CanonicalAsrAuthority {
  private snapshot: CanonicalAsrSnapshot;

  constructor(restored?: CanonicalAsrSnapshot | null) {
    this.snapshot = restored ?? {
      schema: 'anvil.asr-authority-snapshot.v1', cursor: 0, coveredLines: [0],
      unresolvedSkippedLines: [], pendingRecoveryProposal: null, semanticProgressAt: null,
      terminalCompleted: false, postrollEligible: false, captureSessionId: readCaptureSessionId(),
      readyScript: readReadyScript(),
    };
    this.publish();
  }

  proposeRecovery(target: number, reason: string): void {
    this.snapshot.pendingRecoveryProposal = { target: Math.max(0, Math.floor(target)), reason, proposedAt: Date.now() };
    this.persist();
  }

  commitCursor(target: number, reason: string, totalLines: number): CanonicalAsrSnapshot {
    const next = Math.max(0, Math.floor(target));
    const previous = this.snapshot.cursor;
    if (next > previous + 1) {
      for (let line = previous + 1; line < next; line += 1) {
        if (!this.snapshot.unresolvedSkippedLines.includes(line)) this.snapshot.unresolvedSkippedLines.push(line);
      }
    }
    for (let line = Math.min(previous, next); line <= next; line += 1) {
      if (!this.snapshot.coveredLines.includes(line)) this.snapshot.coveredLines.push(line);
    }
    if (/bridge|recovery|rescue|adjacent/i.test(reason) && next <= previous + 1) {
      this.snapshot.unresolvedSkippedLines = this.snapshot.unresolvedSkippedLines.filter((line) => line > next);
      this.snapshot.pendingRecoveryProposal = null;
    }
    this.snapshot.cursor = next;
    this.snapshot.semanticProgressAt = Date.now();
    const terminal = totalLines > 0 && next === totalLines - 1 && this.snapshot.unresolvedSkippedLines.length === 0;
    this.snapshot.terminalCompleted = terminal;
    this.snapshot.postrollEligible = terminal;
    this.snapshot.captureSessionId = readCaptureSessionId() ?? this.snapshot.captureSessionId;
    this.snapshot.readyScript = readReadyScript() ?? this.snapshot.readyScript;
    this.persist();
    return this.getSnapshot();
  }

  getSnapshot(): CanonicalAsrSnapshot {
    return JSON.parse(JSON.stringify(this.snapshot)) as CanonicalAsrSnapshot;
  }

  private persist(): void {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot)); } catch {}
    this.publish();
  }

  private publish(): void {
    (window as Window & { __tpCanonicalAsrAuthority?: CanonicalAsrSnapshot }).__tpCanonicalAsrAuthority = this.getSnapshot();
    try { window.dispatchEvent(new CustomEvent('tp:asr:canonical-authority', { detail: this.getSnapshot() })); } catch {}
  }
}

export function restoreCanonicalAsrAuthority(): CanonicalAsrAuthority {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CanonicalAsrSnapshot;
      if (parsed?.schema === 'anvil.asr-authority-snapshot.v1') return new CanonicalAsrAuthority(parsed);
    }
  } catch {}
  return new CanonicalAsrAuthority();
}
