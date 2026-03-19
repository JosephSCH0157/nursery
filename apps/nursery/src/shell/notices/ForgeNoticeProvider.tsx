import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  canUseDesktopNotifications,
  ensureNotificationPermission,
  readDesktopNotificationPermission,
  showDesktopNotice,
} from "./forgeNotice.browser";
import ForgeNoticeToasts from "./ForgeNoticeToasts";
import {
  FORGE_NOTICE_EVENT,
  isForgeNoticeEventDetail,
  type ForgeNoticeEvent,
  type ForgeNoticeToast,
} from "./forgeNotice.types";
import "./forgeNotices.css";

const MAX_VISIBLE_TOASTS = 4;
const MAX_NOTICE_HISTORY = 20;
const NOTICE_DEDUPE_WINDOW_MS = 15_000;
const NOTICE_DISMISS_MS: Record<ForgeNoticeToast["severity"], number> = {
  info: 4_500,
  success: 5_000,
  warning: 6_500,
  error: 8_000,
};

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `forge-notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function toToast(detail: ForgeNoticeEvent): ForgeNoticeToast {
  return {
    ...detail,
    id: createToastId(),
    message: readTrimmedString(detail.message) ?? null,
    route: readTrimmedString(detail.route) ?? null,
  };
}

function buildNoticeDedupKey(detail: ForgeNoticeEvent): string {
  return [
    detail.tool,
    detail.job,
    detail.severity,
    detail.title.trim(),
    readTrimmedString(detail.message) ?? "",
    readTrimmedString(detail.route) ?? "",
    readTrimmedString(detail.workpieceId) ?? "",
  ].join("|");
}

function shouldUseDesktopNotice(): boolean {
  if (typeof document === "undefined") return false;
  const visibility = typeof document.visibilityState === "string"
    ? document.visibilityState
    : "visible";
  const focused = typeof document.hasFocus === "function" ? document.hasFocus() : true;
  return visibility !== "visible" || !focused;
}

function clearTimer(timerId: number | undefined): void {
  if (typeof timerId !== "number") return;
  window.clearTimeout(timerId);
}

type ForgeNoticeProviderProps = {
  children: ReactNode;
};

export default function ForgeNoticeProvider({ children }: ForgeNoticeProviderProps) {
  const navigate = useNavigate();
  const [toasts, setToasts] = useState<ForgeNoticeToast[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() =>
    readDesktopNotificationPermission(),
  );
  const [notificationPromptOpen, setNotificationPromptOpen] = useState(false);
  const historyRef = useRef<ForgeNoticeToast[]>([]);
  const dedupeRef = useRef<Map<string, number>>(new Map());
  const dismissTimersRef = useRef<Map<string, number>>(new Map());
  const notificationPromptDismissedRef = useRef(false);

  const dismissNotice = useCallback((noticeId: string) => {
    const timerId = dismissTimersRef.current.get(noticeId);
    clearTimer(timerId);
    dismissTimersRef.current.delete(noticeId);
    setToasts((prev) => prev.filter((entry) => entry.id !== noticeId));
  }, []);

  const activateNotice = useCallback((noticeId: string) => {
    const notice = historyRef.current.find((entry) => entry.id === noticeId) ?? null;
    if (notice?.route) {
      navigate(notice.route);
    }
    dismissNotice(noticeId);
  }, [dismissNotice, navigate]);

  const requestDesktopNotifications = useCallback(async () => {
    const nextPermission = await ensureNotificationPermission();
    setNotificationPermission(nextPermission);
    if (nextPermission !== "default") {
      notificationPromptDismissedRef.current = true;
      setNotificationPromptOpen(false);
    }
  }, []);

  useEffect(() => {
    if (!canUseDesktopNotifications()) {
      setNotificationPromptOpen(false);
      return;
    }
    setNotificationPermission(readDesktopNotificationPermission());
  }, []);

  useEffect(() => {
    const onNotice = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (!isForgeNoticeEventDetail(customEvent.detail)) {
        return;
      }

      const detail = customEvent.detail;
      const now = Date.now();
      for (const [key, timestamp] of dedupeRef.current.entries()) {
        if (now - timestamp > NOTICE_DEDUPE_WINDOW_MS) {
          dedupeRef.current.delete(key);
        }
      }

      const dedupeKey = buildNoticeDedupKey(detail);
      const lastSeenAt = dedupeRef.current.get(dedupeKey) ?? 0;
      if (now - lastSeenAt < NOTICE_DEDUPE_WINDOW_MS) {
        return;
      }
      dedupeRef.current.set(dedupeKey, now);

      const nextToast = toToast(detail);
      historyRef.current = [nextToast, ...historyRef.current].slice(0, MAX_NOTICE_HISTORY);
      setToasts((prev) => [nextToast, ...prev].slice(0, MAX_VISIBLE_TOASTS));

      const dismissDelay = NOTICE_DISMISS_MS[nextToast.severity];
      const timerId = window.setTimeout(() => {
        dismissNotice(nextToast.id);
      }, dismissDelay);
      dismissTimersRef.current.set(nextToast.id, timerId);

      const backgrounded = shouldUseDesktopNotice();
      const currentPermission = readDesktopNotificationPermission();
      setNotificationPermission(currentPermission);

      if (backgrounded && currentPermission === "granted") {
        showDesktopNotice(detail, () => {
          if (nextToast.route) {
            navigate(nextToast.route);
          }
        });
      } else if (
        currentPermission === "default"
        && !notificationPromptDismissedRef.current
      ) {
        setNotificationPromptOpen(true);
      }
    };

    window.addEventListener(FORGE_NOTICE_EVENT, onNotice as EventListener);
    return () => {
      window.removeEventListener(FORGE_NOTICE_EVENT, onNotice as EventListener);
    };
  }, [dismissNotice, navigate]);

  useEffect(() => {
    return () => {
      for (const timerId of dismissTimersRef.current.values()) {
        clearTimer(timerId);
      }
      dismissTimersRef.current.clear();
    };
  }, []);

  return (
    <>
      {children}
      <ForgeNoticeToasts
        toasts={toasts}
        notificationPromptOpen={notificationPromptOpen}
        notificationPermission={notificationPermission}
        onActivateNotice={activateNotice}
        onDismissNotice={dismissNotice}
        onDismissNotificationPrompt={() => {
          notificationPromptDismissedRef.current = true;
          setNotificationPromptOpen(false);
        }}
        onRequestDesktopNotifications={() => void requestDesktopNotifications()}
      />
    </>
  );
}
