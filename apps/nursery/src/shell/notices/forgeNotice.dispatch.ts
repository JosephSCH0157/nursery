import { FORGE_NOTICE_EVENT, type ForgeNoticeEvent } from "./forgeNotice.types";

export function dispatchForgeNotice(
  notice: Omit<ForgeNoticeEvent, "timestamp"> & { timestamp?: number },
): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent<ForgeNoticeEvent>(FORGE_NOTICE_EVENT, {
      detail: {
        ...notice,
        timestamp: notice.timestamp ?? Date.now(),
      },
    }));
  } catch {
    // ignore dispatch failures
  }
}
