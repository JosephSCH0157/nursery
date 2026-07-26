import type { HearthStoreKind } from "../../storage/hearth-store";
import {
  normalizeWorkpieceWorkspaceTab,
  resolveRestoredWorkpieceWorkspaceTab,
  type WorkpieceWorkspaceTab,
} from "../../lib/hearth-workpiece-tab-shell";
import type { HearthMode, UiDensity } from "./hearth-shell-contracts";

const STORE_KIND_KEY = "hearth_store_kind";
const DEV_MODE_KEY = "tp_dev_mode";
const MODE_STORAGE_PREFIX = "hearth:ui:mode:v1:";
const UI_DENSITY_STORAGE_PREFIX = "hearth:ui:density:v1:";
const WORKPIECE_TAB_STORAGE_PREFIX = "hearth:workpiece-tab:v1:";
const WORKSPACE_TAB_STORAGE_PREFIX = "hearth:workspace-tab:v1:";
const LAST_WORKPIECE_TAB_STORAGE_KEY = "hearth:workpiece-tab:last:v1";

export function isDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("dev") || params.get("dev") === "1") return true;
  } catch {
    // Ignore query parsing failures.
  }
  try {
    if (window.localStorage.getItem(DEV_MODE_KEY) === "1") return true;
  } catch {
    // Ignore storage failures.
  }
  try {
    const w = window as typeof window & {
      __TP_DEV?: unknown;
      __TP_DEV1?: unknown;
      __tpDevMode?: unknown;
    };
    if (w.__TP_DEV || w.__TP_DEV1 || w.__tpDevMode) return true;
  } catch {
    // Ignore global inspection failures.
  }
  return false;
}

export function resolveStoreKind(): HearthStoreKind {
  if (typeof window === "undefined") return "tongs";
  if (!isDevMode()) return "tongs";

  try {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get("store") ?? params.get("hearthStore") ?? "")
      .trim()
      .toLowerCase();

    if (requested === "tongs" || requested === "local") {
      try {
        window.localStorage.setItem(STORE_KIND_KEY, requested);
      } catch {
        // Ignore storage failures (private mode, access blocked, etc.).
      }
      return requested as HearthStoreKind;
    }
  } catch {
    // Ignore URL parsing failures and fall back to localStorage.
  }

  try {
    const saved = window.localStorage.getItem(STORE_KIND_KEY)?.trim().toLowerCase();
    if (saved === "tongs" || saved === "local") {
      return saved as HearthStoreKind;
    }
  } catch {
    // Ignore storage failures and fall back to tongs.
  }

  return "tongs";
}

export function readMode(workpieceId: string | null): HearthMode | null {
  if (!workpieceId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${MODE_STORAGE_PREFIX}${workpieceId}`);
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed === "home") return "sparks";
    if (trimmed === "draft" || trimmed === "planning" || trimmed === "sources" || trimmed === "revisions") {
      return "focus";
    }
    if (
      trimmed === "sparks"
      || trimmed === "episodes"
      || trimmed === "ready"
      || trimmed === "series"
      || trimmed === "focus"
    ) {
      return trimmed as HearthMode;
    }
  } catch {
    // ignore storage failures
  }
  return null;
}

export function writeMode(workpieceId: string | null, mode: HearthMode): void {
  if (!workpieceId || typeof window === "undefined") return;
  if (mode === "sparks") return;
  try {
    window.localStorage.setItem(`${MODE_STORAGE_PREFIX}${workpieceId}`, mode);
  } catch {
    // ignore storage failures
  }
}

export function readWorkpieceWorkspaceTab(
  workpieceId: string | null,
  workspaceId: string | null,
): WorkpieceWorkspaceTab {
  if (typeof window === "undefined") return "script";
  try {
    return resolveRestoredWorkpieceWorkspaceTab({
      workpieceTab: workpieceId ? window.localStorage.getItem(`${WORKPIECE_TAB_STORAGE_PREFIX}${workpieceId}`) : null,
      workspaceTab: workspaceId ? window.localStorage.getItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${workspaceId}`) : null,
      lastTab: window.localStorage.getItem(LAST_WORKPIECE_TAB_STORAGE_KEY),
    });
  } catch {
    // ignore storage failures
  }
  return "script";
}

export function writeWorkpieceWorkspaceTab(
  workpieceId: string | null,
  workspaceId: string | null,
  tab: WorkpieceWorkspaceTab,
): void {
  if (typeof window === "undefined") return;
  try {
    const normalizedTab = normalizeWorkpieceWorkspaceTab(tab);
    if (workpieceId) {
      window.localStorage.setItem(`${WORKPIECE_TAB_STORAGE_PREFIX}${workpieceId}`, normalizedTab);
    }
    if (workspaceId) {
      window.localStorage.setItem(`${WORKSPACE_TAB_STORAGE_PREFIX}${workspaceId}`, normalizedTab);
    }
    window.localStorage.setItem(LAST_WORKPIECE_TAB_STORAGE_KEY, normalizedTab);
  } catch {
    // ignore storage failures
  }
}

export function readWorkspaceUiDensity(workspaceId: string | null): UiDensity {
  if (!workspaceId || typeof window === "undefined") return "comfortable";
  try {
    const raw = window.localStorage.getItem(`${UI_DENSITY_STORAGE_PREFIX}${workspaceId}`)?.trim().toLowerCase();
    if (raw === "compact") return "compact";
  } catch {
    // ignore storage failures
  }
  return "comfortable";
}

export function writeWorkspaceUiDensity(workspaceId: string | null, density: UiDensity): void {
  if (!workspaceId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${UI_DENSITY_STORAGE_PREFIX}${workspaceId}`, density);
  } catch {
    // ignore storage failures
  }
}
