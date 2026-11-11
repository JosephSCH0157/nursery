import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readHearthPrimaryScript } from '../lib/hearth-script-repo';
import { canonicalHearthApprovalText } from '../lib/hearth-script-approval';
import { publishReviewedScript, ScriptPublicationConflict, type ScriptBasis, type ScriptAcknowledgment } from '../lib/hearth-script-publication';
import type { Draft } from '../domain/draft';

export function useHearthScriptPublication(workspaceId: string | null, workpieceId: string | null, draft: Draft | null, rememberBasis?: (draftId: string, basis: NonNullable<Draft["scriptPublicationBasis"]>) => void) {
  const latest = useRef({ workspaceId, workpieceId, draft });
  useLayoutEffect(() => { latest.current = { workspaceId, workpieceId, draft }; }, [workspaceId, workpieceId, draft]);
  const [loaded, setLoaded] = useState<{ workpieceId: string; basis: ScriptBasis; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const pending = useRef<{ workpieceId: string; text: string; basis: ScriptBasis; operationId: string } | null>(null);
  const recoveryKey = workspaceId && workpieceId ? `hearth:script-publication-recovery:${workspaceId}:${workpieceId}` : null;
  const [ack, setAck] = useState<ScriptAcknowledgment | null>(null);
  useEffect(() => {
    let cancelled = false; setLoaded(null); setAck(null); pending.current = null;
    if (recoveryKey) try { pending.current = JSON.parse(sessionStorage.getItem(recoveryKey) ?? "null"); } catch { /* no recovered hint */ }
    if (workpieceId) void readHearthPrimaryScript(workpieceId).then(result => {
      if (cancelled || !result.ok) return;
      const { revision, hash, text } = result.data;
      if (text !== null && (!revision || !hash)) return;
      setLoaded({ workpieceId, basis: { revision: revision ?? 0, hash }, text: text ?? '' });
      if (revision && hash && text !== null) setAck({ revision, hash, bytes: new TextEncoder().encode(text).length });
    }).catch(() => { /* fail closed until canonical hydration succeeds */ });
    return () => { cancelled = true; };
  }, [workspaceId, workpieceId, recoveryKey]);
  useEffect(() => {
    if (loaded && draft && loaded.workpieceId === workpieceId && !draft.scriptPublicationBasis
      && (loaded.basis.revision === 0 || canonicalHearthApprovalText(draft.body) === loaded.text)) {
      rememberBasis?.(draft.id, { workpieceId: loaded.workpieceId, ...loaded.basis });
    }
  }, [loaded, draft, workpieceId, rememberBasis]);
  const eligible = !!loaded && loaded.workpieceId === workpieceId && !!ack && !busy
    && !!draft && canonicalHearthApprovalText(draft.body) === loaded.text;
  async function save(persist: (frozen: Draft) => Promise<boolean>): Promise<boolean> {
    if (inFlight.current) return false;
    if (!workspaceId || !workpieceId || !draft || !loaded || loaded.workpieceId !== workpieceId) throw new Error('Canonical script basis is unavailable. Reload before saving.');
    const frozen = { ...draft, body: canonicalHearthApprovalText(draft.body) };
    if (pending.current && (pending.current.workpieceId !== workpieceId || pending.current.text !== frozen.body)) {
      throw new Error('A previous Save has an unresolved outcome. Restore that text and recover its operation before publishing new edits.');
    }
    const persistedBasis = frozen.scriptPublicationBasis;
    if (persistedBasis && (persistedBasis.workpieceId !== workpieceId || !Number.isSafeInteger(persistedBasis.revision))) throw new Error('The draft publication basis is invalid. Reload and review.');
    if (!persistedBasis && frozen.body !== loaded.text && loaded.basis.revision !== 0) {
      throw new Error('This draft has no verified editing basis. Reload the canonical script, review it, then apply your edits.');
    }
    const basis = persistedBasis && frozen.body !== loaded.text ? persistedBasis : loaded.basis;
    const op = pending.current ?? { workpieceId, text: frozen.body, basis, operationId: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setAck(null);
    const current = () => latest.current.workspaceId === workspaceId && latest.current.workpieceId === workpieceId
      && latest.current.draft?.id === frozen.id && canonicalHearthApprovalText(latest.current.draft.body) === frozen.body;
    try {
      if (!await persist({ ...frozen, scriptPublicationBasis: { workpieceId, ...op.basis } })) return false;
      if (!current()) throw new Error('The editor changed during Save. Review the current draft and save again.');
      pending.current = op;
      if (recoveryKey) sessionStorage.setItem(recoveryKey, JSON.stringify(op));
      const receipt = await publishReviewedScript({ workspaceId, workpieceId, operationId: op.operationId, text: op.text, basis: op.basis });
      pending.current = null;
      if (recoveryKey) sessionStorage.removeItem(recoveryKey);
      if (latest.current.workpieceId === workpieceId) {
        setLoaded({ workpieceId, basis: { revision: receipt.revision, hash: receipt.hash }, text: frozen.body });
        if (current()) {
          setAck(receipt);
          rememberBasis?.(frozen.id, { workpieceId, revision: receipt.revision, hash: receipt.hash });
        }
      }
      if (!current()) throw new Error('The saved script is confirmed, but newer editor changes need a separate Save before approval.');
      return true;
    } catch (error) {
      if (error instanceof ScriptPublicationConflict) {
        pending.current = null;
        if (recoveryKey) sessionStorage.removeItem(recoveryKey);
        setLoaded(null); setAck(null);
      }
      throw error;
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function reloadCanonical() {
    if (!workpieceId || inFlight.current || pending.current) throw new Error('Recover the pending Save before replacing the editor with canonical content.');
    const previous = latest.current.draft;
    const result = await readHearthPrimaryScript(workpieceId);
    if (!result.ok || result.data.text === null || !result.data.revision || !result.data.hash) throw new Error('Canonical script is unavailable; the editor was preserved.');
    if (latest.current.workpieceId !== workpieceId || latest.current.draft?.id !== previous?.id || latest.current.draft?.body !== previous?.body) throw new Error('The active editor changed; the editor was preserved.');
    const basis = { revision: result.data.revision, hash: result.data.hash };
    setLoaded({ workpieceId, basis, text: result.data.text });
    setAck({ ...basis, bytes: new TextEncoder().encode(result.data.text).length });
    return { text: result.data.text, basis: { workpieceId, ...basis } };
  }
  return { save, reloadCanonical, busy, canSave: !!loaded && loaded.workpieceId === workpieceId && !busy, eligible, acknowledgment: eligible ? ack : null };
}
