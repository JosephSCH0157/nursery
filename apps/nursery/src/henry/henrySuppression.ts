import type { HenrySuppressionState } from "@forge/shared/henry";

function isTypingFocusedElement(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement as HTMLElement | null;
  if (!active) return false;
  const tag = active.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return active.isContentEditable;
}

function hasBlockingDialog(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector("dialog[open]")
    || document.querySelector("[role='dialog'][aria-modal='true']")
    || document.querySelector("[role='alertdialog'][aria-modal='true']"),
  );
}

function isRecordingSurface(pathname: string): boolean {
  return pathname.startsWith("/app/anvil");
}

export function resolveHenrySuppressionState(args: {
  pathname: string;
  panelOpen: boolean;
  mutedUntil: string | null;
}): HenrySuppressionState {
  const reasons: string[] = [];

  if (args.panelOpen) reasons.push("panel-open");
  if (isTypingFocusedElement()) reasons.push("typing-focus");
  if (hasBlockingDialog()) reasons.push("blocking-dialog");
  if (isRecordingSurface(args.pathname)) reasons.push("recording-surface");
  if (args.mutedUntil) {
    const untilMs = Date.parse(args.mutedUntil);
    if (!Number.isNaN(untilMs) && untilMs > Date.now()) reasons.push("muted");
  }

  return {
    isSuppressed: reasons.length > 0,
    reasons,
  };
}
