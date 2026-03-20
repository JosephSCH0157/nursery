import type { ForgeNoticeToast } from "./forgeNotice.types";

type ForgeNoticeToastsProps = {
  toasts: ForgeNoticeToast[];
  notificationPromptOpen: boolean;
  notificationPermission: NotificationPermission;
  onActivateNotice: (noticeId: string) => void;
  onDismissNotice: (noticeId: string) => void;
  onDismissNotificationPrompt: () => void;
  onRequestDesktopNotifications: () => void;
};

function severityLabel(severity: ForgeNoticeToast["severity"]): string {
  if (severity === "success") return "Success";
  if (severity === "warning") return "Warning";
  if (severity === "error") return "Error";
  return "Info";
}

export default function ForgeNoticeToasts({
  toasts,
  notificationPromptOpen,
  notificationPermission,
  onActivateNotice,
  onDismissNotice,
  onDismissNotificationPrompt,
  onRequestDesktopNotifications,
}: ForgeNoticeToastsProps) {
  if (toasts.length === 0 && !notificationPromptOpen) {
    return null;
  }

  return (
    <div className="forge-notice-region" aria-live="polite" aria-atomic="false">
      {notificationPromptOpen ? (
        <section className="forge-notice-prompt" aria-label="Desktop notification prompt">
          <div className="forge-notice-prompt__title">Enable desktop notices</div>
          <div className="forge-notice-prompt__copy">
            Allow desktop notices so Forge can alert you when long-running jobs finish while this window is inactive.
          </div>
          <div className="forge-notice-prompt__actions">
            <button type="button" onClick={onRequestDesktopNotifications}>
              {notificationPermission === "default" ? "Enable" : "Open Settings"}
            </button>
            <button type="button" onClick={onDismissNotificationPrompt}>
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      <div className="forge-notice-stack">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className={`forge-notice-card is-${toast.severity}`}
            role="status"
            aria-label={`${severityLabel(toast.severity)} notice`}
          >
            <button
              type="button"
              className="forge-notice-card__body"
              onClick={() => onActivateNotice(toast.id)}
              disabled={!toast.route}
            >
              <div className="forge-notice-card__meta">
                <span className="forge-notice-card__tool">{toast.tool}</span>
                <span className="forge-notice-card__severity">{severityLabel(toast.severity)}</span>
              </div>
              <div className="forge-notice-card__title">{toast.title}</div>
              {toast.message ? (
                <div className="forge-notice-card__message">{toast.message}</div>
              ) : null}
            </button>
            <button
              type="button"
              className="forge-notice-card__close"
              aria-label="Dismiss notice"
              onClick={() => onDismissNotice(toast.id)}
            >
              ×
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
