import { useCallback, useRef } from "react";
import type { Draft } from "../domain/draft";
import { resolveTongsRequestApiToken, tongsFetch } from "../lib/tongs-fetch";
import { canonicalHearthApprovalText } from "../lib/hearth-script-approval";
import { reconcileApprovedScriptRecordingReadiness } from "../lib/hearth-script-approval-authority";
import type { HearthOperationAuthority } from "../lib/hearth-operation-authority";

type UseHearthAnvilOpenActionArgs = {
  activeDraft: Draft | null;
  activeWorkpieceIsArchived: boolean;
  isSaving: boolean;
  workspaceId: string | null;
  workpieceId: string | null;
  setError: (next: string | null) => void;
  buildOpenInAnvilHref: (workspace: string, workpiece: string) => string | null;
  flushChatHistoryNow: (args?: { draftId?: string | null }) => void;
  operationAuthority: HearthOperationAuthority;
};

const REVIEW_REQUIRED = "The working script is not the current approved script. Approve this exact script before starting recording.";
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Read-only: navigation consumes Ready authority, never manufactures it by
// publishing a mutable script revision. Anvil rechecks it on arrival.
export async function verifyHearthReadyHandoff(args: {
  workspaceId: string; workpieceId: string; scriptText: string; isCurrent: () => boolean;
}): Promise<boolean> {
  const path = `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}`;
  try {
    const response = await tongsFetch(`${path}/production-script`, { method: "GET", cache: "no-store" });
    const body: unknown = await response.json();
    const ready = record(body) && body.ok === true && record(body.data) ? body.data : null;
    if (!args.isCurrent() || !response.ok || !ready) return false;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (ready.workspace_id !== args.workspaceId || ready.workpiece_id !== args.workpieceId
      || ready.source_file_path !== "script/script.md"
      || !Number.isInteger(ready.source_file_revision) || Number(ready.source_file_revision) < 1
      || !Number.isInteger(ready.script_approval_revision) || Number(ready.script_approval_revision) < 1
      || !uuid.test(String(ready.ready_transition_id)) || !uuid.test(String(ready.script_approval_id))
      || ready.script_text !== args.scriptText) return false;
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(args.scriptText));
    const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
    if (!args.isCurrent() || ready.script_content_hash !== hash) return false;
    // Catch a canonical revision changing during the Ready read, even when it
    // contains identical text. Never adopt that newer revision.
    const sourceResponse = await tongsFetch(`${path}/read-file?path=script%2Fscript.md`, { method: "GET", cache: "no-store" });
    const source: unknown = await sourceResponse.json();
    return args.isCurrent() && sourceResponse.ok && record(source) && source.ok === true
      && record(source.file_row) && source.file_row.revision === ready.source_file_revision
      && source.file_row.hash_value === hash && source.data === args.scriptText;
  } catch {
    return false;
  }
}

export function useHearthAnvilOpenAction(args: UseHearthAnvilOpenActionArgs) {
  const latest = useRef(args);
  latest.current = args;
  return useCallback(async () => {
    const workspace = args.workspaceId?.trim() ?? "";
    const workpiece = args.workpieceId?.trim() ?? "";
    const operation = args.operationAuthority.begin("anvil.handoff.open");
    if (!workspace || !workpiece || !args.activeDraft || !args.activeDraft.body.trim()) {
      args.setError("Start Recording needs a loaded script, workspace, and episode.");
      return;
    }
    if (args.activeWorkpieceIsArchived || args.isSaving) {
      args.setError(args.isSaving ? "Wait for the script to finish saving before starting recording." : "This episode is archived. Restore it in Hearth before recording.");
      return;
    }
    const href = args.buildOpenInAnvilHref(workspace, workpiece);
    if (!href) {
      args.setError("Start Recording is unavailable until episode context finishes loading.");
      return;
    }
    const scriptText = canonicalHearthApprovalText(args.activeDraft.body);
    const isCurrent = () => args.operationAuthority.isCurrent(operation)
      && latest.current.workspaceId === args.workspaceId && latest.current.workpieceId === args.workpieceId
      && !latest.current.activeWorkpieceIsArchived && !latest.current.isSaving
      && latest.current.activeDraft?.id === args.activeDraft?.id
      && canonicalHearthApprovalText(latest.current.activeDraft?.body ?? "") === scriptText;
    args.setError(null);
    const reconciliation = await reconcileApprovedScriptRecordingReadiness({
      workspaceId: workspace,
      workpieceId: workpiece,
    });
    if (!isCurrent()) return;
    if (!reconciliation.ok) {
      args.setError(reconciliation.error);
      return;
    }
    const ready = await verifyHearthReadyHandoff({ workspaceId: workspace, workpieceId: workpiece, scriptText, isCurrent });
    if (!isCurrent()) return;
    if (!ready) {
      args.setError(REVIEW_REQUIRED);
      return;
    }
    // Preserve the existing transport bridge; it grants no script authority.
    try {
      const token = resolveTongsRequestApiToken();
      if (token) window.localStorage.setItem("forge_tongs_api_token_v1", token);
    } catch { /* The authenticated Anvil reader still fails closed. */ }
    args.flushChatHistoryNow({ draftId: args.activeDraft.id });
    if (!isCurrent()) return;
    try { window.location.assign(href); }
    catch { args.setError("Unable to open Anvil. Try again."); }
  }, [args]);
}
