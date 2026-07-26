import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import { resolveWorkpieceId, resolveWorkspaceId } from "../../lib/sources-repo";
import { useHearthOperationAuthority } from "../../hooks/useHearthOperationAuthority";
import type {
  HearthOperationAuthority,
  HearthOperationScope,
} from "../../lib/hearth-operation-authority";
import type {
  FocusTab,
  HearthMode,
  UiDensity,
} from "./hearth-shell-contracts";
import { hasIncomingBarStockIntakeQuery, normalizeUuid } from "./hearth-shell-route";
import { readWorkspaceUiDensity } from "./hearth-shell-preferences";

export type HearthShellIdentityState = {
  incomingBarStockIntakeRoute: boolean;
  mode: HearthMode;
  setMode: Dispatch<SetStateAction<HearthMode>>;
  focusTab: FocusTab;
  setFocusTab: Dispatch<SetStateAction<FocusTab>>;
  workspaceId: string | null;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  uiDensity: UiDensity;
  setUiDensity: Dispatch<SetStateAction<UiDensity>>;
  workpieceId: string | null;
  setWorkpieceId: Dispatch<SetStateAction<string | null>>;
};

export function useHearthShellIdentityState(): HearthShellIdentityState {
  const [incomingBarStockIntakeRoute] = useState<boolean>(() => hasIncomingBarStockIntakeQuery());
  const [mode, setMode] = useState<HearthMode>("sparks");
  const [focusTab, setFocusTab] = useState<FocusTab>("draft");
  const [workspaceId, setWorkspaceId] = useState<string | null>(() => resolveWorkspaceId());
  const [uiDensity, setUiDensity] = useState<UiDensity>(() => readWorkspaceUiDensity(resolveWorkspaceId()));
  const [workpieceId, setWorkpieceId] = useState<string | null>(() => (
    incomingBarStockIntakeRoute ? null : resolveWorkpieceId()
  ));

  return {
    incomingBarStockIntakeRoute,
    mode,
    setMode,
    focusTab,
    setFocusTab,
    workspaceId,
    setWorkspaceId,
    uiDensity,
    setUiDensity,
    workpieceId,
    setWorkpieceId,
  };
}

export function useHearthActiveIdentityRef(
  workpieceId: string | null,
): MutableRefObject<string | null> {
  return useRef<string | null>(workpieceId);
}

export function useHearthActiveIdentityRefSync(
  workpieceIdRef: MutableRefObject<string | null>,
  workpieceId: string | null,
): void {
  useEffect(() => {
    workpieceIdRef.current = workpieceId;
  }, [workpieceIdRef, workpieceId]);
}

export function useHearthWorkspaceIdentitySync(args: {
  workspaceId: string | null;
  setWorkspaceId: Dispatch<SetStateAction<string | null>>;
  workspaceStorageKeys: ReadonlySet<string>;
}): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshWorkspaceFromGlobalState = () => {
      const nextWorkspaceId = resolveWorkspaceId();
      if (!nextWorkspaceId || nextWorkspaceId === args.workspaceId) return;
      args.setWorkspaceId(nextWorkspaceId);
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key && !args.workspaceStorageKeys.has(event.key)) return;
      refreshWorkspaceFromGlobalState();
    };
    const onWorkspaceChanged = () => {
      refreshWorkspaceFromGlobalState();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("forge:workspace-changed", onWorkspaceChanged as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("forge:workspace-changed", onWorkspaceChanged as EventListener);
    };
  }, [args.setWorkspaceId, args.workspaceId, args.workspaceStorageKeys]);
}

export function createHearthIdentityResetKey(
  workspaceId: string | null | undefined,
  workpieceId: string | null | undefined,
): string {
  return `${normalizeUuid(workspaceId) ?? "none"}:${normalizeUuid(workpieceId) ?? "none"}`;
}

export function useHearthShellOperationAuthority(
  scope: HearthOperationScope,
): HearthOperationAuthority {
  return useHearthOperationAuthority(scope);
}
