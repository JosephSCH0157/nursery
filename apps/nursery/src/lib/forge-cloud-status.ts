import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

export type ForgeCloudStatus = "connected" | "auth_missing" | "local_only" | "offline";

export type ForgeCloudState = {
  status: ForgeCloudStatus;
  label: string;
  detail: string;
  isChecking: boolean;
  isOnline: boolean;
  hasSession: boolean;
  hasTongsApiToken: boolean;
  hasCloudAuth: boolean;
};

type ForgeCloudStatusOptions = {
  session: Session | null;
  sessionLoading?: boolean;
  localOnly?: boolean;
};

type ForgeWindow = Window &
  typeof globalThis & {
    __forgeTongsApiToken?: unknown;
    __tpTongsApiToken?: unknown;
  };

const PLACEHOLDER_TONGS_TOKENS = new Set(["DEV_TOKEN"]);

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function resolveTongsApiTokenSnapshot(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = readString(params.get("tongs_api_token") ?? params.get("tongsApiToken"));
    if (fromQuery && !PLACEHOLDER_TONGS_TOKENS.has(fromQuery)) {
      return fromQuery;
    }
  } catch {
    // ignore
  }

  try {
    const runtimeWindow = window as ForgeWindow;
    const fromWindow = readString(runtimeWindow.__forgeTongsApiToken ?? runtimeWindow.__tpTongsApiToken);
    if (fromWindow && !PLACEHOLDER_TONGS_TOKENS.has(fromWindow)) {
      return fromWindow;
    }
  } catch {
    // ignore
  }

  try {
    const fromStorage = readString(window.localStorage.getItem("forge_tongs_api_token_v1"));
    return fromStorage && !PLACEHOLDER_TONGS_TOKENS.has(fromStorage) ? fromStorage : null;
  } catch {
    return null;
  }
}

function readOnlineState(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function resolveForgeCloudState(args: {
  isOnline: boolean;
  session: Session | null;
  sessionLoading: boolean;
  localOnly: boolean;
}): ForgeCloudState {
  const hasSession = Boolean(args.session?.access_token);
  const hasTongsApiToken = Boolean(resolveTongsApiTokenSnapshot());
  const hasCloudAuth = hasSession || hasTongsApiToken;
  const isChecking = args.sessionLoading && !hasCloudAuth && !args.localOnly && args.isOnline;

  if (!args.isOnline) {
    return {
      status: "offline",
      label: "Forge Cloud: Offline",
      detail: "Browser is offline. Forge is running without cloud access.",
      isChecking: false,
      isOnline: false,
      hasSession,
      hasTongsApiToken,
      hasCloudAuth,
    };
  }

  if (args.localOnly) {
    return {
      status: "local_only",
      label: "Forge Cloud: Local Mode",
      detail: "Cloud writes are disabled for this view. Forge is staying on the local path.",
      isChecking: false,
      isOnline: true,
      hasSession,
      hasTongsApiToken,
      hasCloudAuth,
    };
  }

  if (hasCloudAuth) {
    return {
      status: "connected",
      label: "Forge Cloud: Connected",
      detail: hasTongsApiToken && !hasSession
        ? "Forge has a Tongs token and can use cloud metadata endpoints."
        : "Forge has an authenticated session and can use cloud metadata endpoints.",
      isChecking: false,
      isOnline: true,
      hasSession,
      hasTongsApiToken,
      hasCloudAuth,
    };
  }

  return {
    status: "auth_missing",
    label: isChecking ? "Forge Cloud: Checking..." : "Forge Cloud: Auth Required",
    detail: isChecking
      ? "Forge is checking for an existing browser session."
      : "No cloud auth is configured. Forge will stay on the local path until you sign in or provide a Tongs token.",
    isChecking,
    isOnline: true,
    hasSession,
    hasTongsApiToken,
    hasCloudAuth,
  };
}

export function forgeCloudStatus(options: ForgeCloudStatusOptions): ForgeCloudState {
  return resolveForgeCloudState({
    isOnline: readOnlineState(),
    session: options.session,
    sessionLoading: Boolean(options.sessionLoading),
    localOnly: Boolean(options.localOnly),
  });
}

export function useForgeCloudStatus(options: ForgeCloudStatusOptions): ForgeCloudState {
  const [isOnline, setIsOnline] = useState<boolean>(() => readOnlineState());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setIsOnline(readOnlineState());
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return resolveForgeCloudState({
    isOnline,
    session: options.session,
    sessionLoading: Boolean(options.sessionLoading),
    localOnly: Boolean(options.localOnly),
  });
}
