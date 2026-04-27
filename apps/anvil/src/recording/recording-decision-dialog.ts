const MODAL_ID = "tp-recording-decision-modal";
const WORKING_MODAL_ID = "tp-recording-working-modal";
const STYLE_ID = "tp-recording-decision-styles";

type DialogAction = "keep" | "discard";

type RecordingDecisionDialogOptions = {
  takeName: string;
  onKeep: () => Promise<void>;
  onDiscard: () => Promise<void>;
  isRecovery?: boolean;
};

// Module-level cleanup handle for the currently active decision dialog.
// Called by closeAllRecordingOverlays to detach guards when a new dialog preempts the old one.
let _activeDecisionCleanup: (() => void) | null = null;

/** Returns true when a keep/discard decision dialog is currently in the DOM awaiting user input. */
export function isRecordingDecisionPending(): boolean {
  return typeof document !== "undefined" && document.getElementById(MODAL_ID) !== null;
}

type RecordingFinalizeIndicatorOptions = {
  takeName?: string;
  detail?: string;
};

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function closeModal(): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing?.parentElement) {
    existing.parentElement.removeChild(existing);
  }
}

function closeWorkingModal(): void {
  const existing = document.getElementById(WORKING_MODAL_ID);
  if (existing?.parentElement) {
    existing.parentElement.removeChild(existing);
  }
}

function closeAllRecordingOverlays(): void {
  if (_activeDecisionCleanup) {
    _activeDecisionCleanup();
    _activeDecisionCleanup = null;
  }
  closeModal();
  closeWorkingModal();
}

function applyStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${MODAL_ID} {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(8, 15, 30, 0.74);
      z-index: 1700;
    }
    #${WORKING_MODAL_ID} {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(8, 15, 30, 0.74);
      z-index: 1700;
    }
    #${MODAL_ID} .tp-recording-decision-panel {
      width: min(460px, 100%);
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.55);
      padding: 22px;
      font-family: system-ui, "Segoe UI", sans-serif;
    }
    #${WORKING_MODAL_ID} .tp-recording-decision-panel {
      width: min(420px, 100%);
      background: #0f172a;
      color: #f8fafc;
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 14px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.55);
      padding: 22px;
      font-family: system-ui, "Segoe UI", sans-serif;
    }
    #${MODAL_ID} h2 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.15;
    }
    #${WORKING_MODAL_ID} h2 {
      margin: 0 0 10px;
      font-size: 22px;
      line-height: 1.15;
    }
    #${MODAL_ID} .tp-recording-decision-copy {
      margin: 0;
      color: rgba(226, 232, 240, 0.82);
      font-size: 14px;
      line-height: 1.5;
    }
    #${WORKING_MODAL_ID} .tp-recording-decision-copy {
      margin: 0;
      color: rgba(226, 232, 240, 0.82);
      font-size: 14px;
      line-height: 1.5;
    }
    #${MODAL_ID} .tp-recording-decision-file {
      margin: 14px 0 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.86);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: rgba(248, 250, 252, 0.92);
      font-size: 13px;
      word-break: break-word;
    }
    #${WORKING_MODAL_ID} .tp-recording-decision-file {
      margin: 14px 0 0;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(15, 23, 42, 0.86);
      border: 1px solid rgba(148, 163, 184, 0.22);
      color: rgba(248, 250, 252, 0.92);
      font-size: 13px;
      word-break: break-word;
    }
    #${WORKING_MODAL_ID} .tp-recording-working-status {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 18px;
      color: rgba(226, 232, 240, 0.92);
      font-size: 13px;
      line-height: 1.4;
    }
    #${WORKING_MODAL_ID} .tp-recording-working-spinner {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 2px solid rgba(148, 163, 184, 0.28);
      border-top-color: #22c55e;
      animation: tp-recording-working-spin 0.8s linear infinite;
      flex: 0 0 auto;
    }
    @keyframes tp-recording-working-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    #${MODAL_ID} .tp-recording-decision-error {
      min-height: 20px;
      margin: 14px 0 0;
      color: #fca5a5;
      font-size: 13px;
      line-height: 1.4;
    }
    #${MODAL_ID} .tp-recording-decision-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }
    #${MODAL_ID} .tp-recording-decision-btn {
      min-width: 120px;
      border-radius: 999px;
      border: 1px solid rgba(148, 163, 184, 0.3);
      background: transparent;
      color: #e2e8f0;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      padding: 10px 16px;
    }
    #${MODAL_ID} .tp-recording-decision-btn[disabled] {
      opacity: 0.6;
      cursor: wait;
    }
    #${MODAL_ID} .tp-recording-decision-btn--keep {
      background: #22c55e;
      border-color: #22c55e;
      color: #052e16;
    }
    #${MODAL_ID} .tp-recording-decision-btn--discard {
      background: rgba(148, 163, 184, 0.12);
    }
  `;
  document.head.appendChild(style);
}

function buildWorkingMarkup(options: RecordingFinalizeIndicatorOptions): string {
  const detail = String(options.detail || "").trim() || "Saving your take and preparing review options.";
  const takeName = String(options.takeName || "").trim();
  return `
    <div class="tp-recording-decision-panel" role="status" aria-live="polite" aria-labelledby="${WORKING_MODAL_ID}-title">
      <h2 id="${WORKING_MODAL_ID}-title">Finalizing recording</h2>
      <p class="tp-recording-decision-copy">${escapeHtml(detail)}</p>
      ${takeName ? `<div class="tp-recording-decision-file">${escapeHtml(takeName)}</div>` : ""}
      <div class="tp-recording-working-status">
        <span class="tp-recording-working-spinner" aria-hidden="true"></span>
        <span>Working…</span>
      </div>
    </div>
  `;
}

function buildMarkup(takeName: string, isRecovery?: boolean): string {
  const title = isRecovery ? "Recording awaiting review" : "Recording complete";
  const copy = isRecovery
    ? "This recording was saved but not reviewed. Keep or discard it?"
    : "Keep this take for editing?";
  return `
    <div class="tp-recording-decision-panel" role="dialog" aria-modal="true" aria-labelledby="${MODAL_ID}-title">
      <h2 id="${MODAL_ID}-title">${title}</h2>
      <p class="tp-recording-decision-copy">${copy}</p>
      <div class="tp-recording-decision-file">${escapeHtml(takeName)}</div>
      <div class="tp-recording-decision-error" data-role="error" aria-live="polite"></div>
      <div class="tp-recording-decision-actions">
        <button type="button" class="tp-recording-decision-btn tp-recording-decision-btn--discard" data-action="discard">Discard Take</button>
        <button type="button" class="tp-recording-decision-btn tp-recording-decision-btn--keep" data-action="keep">Keep Take</button>
      </div>
    </div>
  `;
}

export function showRecordingFinalizeIndicator(
  options: RecordingFinalizeIndicatorOptions = {},
): void {
  if (typeof document === "undefined") return;
  closeAllRecordingOverlays();
  applyStyles();

  const overlay = document.createElement("div");
  overlay.id = WORKING_MODAL_ID;
  overlay.className = "tp-recording-working-overlay";
  overlay.innerHTML = buildWorkingMarkup(options);
  document.body.appendChild(overlay);
}

export function hideRecordingFinalizeIndicator(): void {
  if (typeof document === "undefined") return;
  closeWorkingModal();
}

export async function showRecordingDecisionDialog(
  options: RecordingDecisionDialogOptions,
): Promise<void> {
  if (typeof document === "undefined") return;
  closeAllRecordingOverlays();
  applyStyles();

  return new Promise<void>((resolve, reject) => {
    const overlay = document.createElement("div");
    overlay.id = MODAL_ID;
    overlay.className = "tp-recording-decision-overlay";
    overlay.innerHTML = buildMarkup(options.takeName, options.isRecovery);

    const discardButton = overlay.querySelector<HTMLButtonElement>('[data-action="discard"]');
    const keepButton = overlay.querySelector<HTMLButtonElement>('[data-action="keep"]');
    const errorNode = overlay.querySelector<HTMLElement>('[data-role="error"]');

    let finished = false;

    const setBusy = (busy: boolean, action?: DialogAction): void => {
      if (discardButton) {
        discardButton.disabled = busy;
        discardButton.textContent = busy && action === "discard" ? "Discarding..." : "Discard Take";
      }
      if (keepButton) {
        keepButton.disabled = busy;
        keepButton.textContent = busy && action === "keep" ? "Saving..." : "Keep Take";
      }
    };

    // Visibility guard: if the tab is backgrounded and something removes the overlay
    // from the DOM while the decision is still pending, re-insert it when the tab
    // becomes visible again so the user still gets to make their choice.
    const visibilityGuard = (): void => {
      try {
        if (document.visibilityState !== "visible") return;
        if (!finished && !document.body.contains(overlay)) {
          document.body.appendChild(overlay);
          keepButton?.focus();
        }
      } catch {}
    };

    // Navigation guard: warn the browser before the user leaves the page while a
    // keep/discard decision is still pending, preventing silent recording loss.
    const beforeUnloadGuard = (event: BeforeUnloadEvent): void => {
      if (!finished) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    const cleanupGuards = (): void => {
      _activeDecisionCleanup = null;
      try { document.removeEventListener("visibilitychange", visibilityGuard); } catch {}
      try { window.removeEventListener("beforeunload", beforeUnloadGuard); } catch {}
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      cleanupGuards();
      closeModal();
      resolve();
    };

    const fail = (error: unknown): void => {
      if (finished) return;
      finished = true;
      cleanupGuards();
      closeModal();
      reject(error);
    };

    const runAction = async (action: DialogAction): Promise<void> => {
      setBusy(true, action);
      if (errorNode) errorNode.textContent = "";
      try {
        if (action === "keep") {
          await options.onKeep();
        } else {
          await options.onDiscard();
        }
        finish();
      } catch (error) {
        setBusy(false);
        if (errorNode) {
          errorNode.textContent = error instanceof Error && error.message.trim()
            ? error.message
            : "Could not save your take decision. Try again.";
        }
      }
    };

    discardButton?.addEventListener("click", () => {
      void runAction("discard");
    });
    keepButton?.addEventListener("click", () => {
      void runAction("keep");
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void runAction("keep");
      }
    });

    try {
      document.body.appendChild(overlay);
      // Install safety guards only after the overlay is in the DOM.
      _activeDecisionCleanup = cleanupGuards;
      try { document.addEventListener("visibilitychange", visibilityGuard); } catch {}
      try { window.addEventListener("beforeunload", beforeUnloadGuard); } catch {}
      keepButton?.focus();
    } catch (error) {
      cleanupGuards();
      fail(error);
    }
  });
}
