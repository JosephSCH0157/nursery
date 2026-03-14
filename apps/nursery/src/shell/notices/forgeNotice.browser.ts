import type { ForgeNoticeEvent } from "./forgeNotice.types";

export function canUseDesktopNotifications(): boolean {
  return typeof window !== "undefined" && typeof Notification !== "undefined";
}

export function readDesktopNotificationPermission(): NotificationPermission {
  if (!canUseDesktopNotifications()) return "denied";
  return Notification.permission;
}

export async function ensureNotificationPermission(): Promise<NotificationPermission> {
  if (!canUseDesktopNotifications()) return "denied";
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  return Notification.requestPermission();
}

export function showDesktopNotice(
  notice: ForgeNoticeEvent,
  onClick?: () => void,
): Notification | null {
  if (!canUseDesktopNotifications() || Notification.permission !== "granted") {
    return null;
  }

  try {
    const notification = new Notification(notice.title, {
      body: notice.message,
      tag: `${notice.tool}:${notice.job}:${notice.workpieceId ?? ""}:${notice.severity}`,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus failures
      }
      onClick?.();
      notification.close();
    };
    return notification;
  } catch {
    return null;
  }
}
