import { useCallback, useEffect, type RefObject } from "react";
import type { WorkpieceWorkspaceTab } from "../lib/hearth-workpiece-tab-shell";

type UseHearthWorkpieceTabLifecycleArgs = {
  activeWorkpieceTab: WorkpieceWorkspaceTab;
  tabDirtyById: Record<WorkpieceWorkspaceTab, boolean>;
  hasAnyUnsavedTab: boolean;
  hasActiveEpisode: boolean;
  hasActiveDraft: boolean;
  revisionModalOpen: boolean;
  focusTab: "draft" | "planning" | "sources" | "revisions";
  activeDraftId: string | null;
  workpieceWorkspaceTabs: readonly WorkpieceWorkspaceTab[];
  tabSwitchUnsavedWarning: string;
  searchRef: RefObject<HTMLInputElement | null>;
  setActiveWorkpieceTab: (next: WorkpieceWorkspaceTab) => void;
  setFocusTab: (next: "draft" | "planning" | "sources" | "revisions") => void;
  setMode: (next: "sparks" | "episodes" | "ready" | "series" | "focus") => void;
  normalizeWorkpieceWorkspaceTab: (value: unknown) => WorkpieceWorkspaceTab;
  persistSession: (draftId: string | null, uiSelectedTab?: string) => Promise<void>;
  resetRevisionSelection: () => void;
  openRevisionModal: () => void;
  onSaveDraft: () => Promise<void>;
};

export function useHearthWorkpieceTabLifecycle(args: UseHearthWorkpieceTabLifecycleArgs) {
  const requestWorkpieceTabChange = useCallback((nextTab: WorkpieceWorkspaceTab): boolean => {
    const normalizedNextTab = args.normalizeWorkpieceWorkspaceTab(nextTab);
    if (normalizedNextTab === args.activeWorkpieceTab) return true;
    if (args.tabDirtyById[args.activeWorkpieceTab]) {
      const shouldContinue = typeof window === "undefined"
        ? true
        : window.confirm(args.tabSwitchUnsavedWarning);
      if (!shouldContinue) return false;
    }
    args.setActiveWorkpieceTab(normalizedNextTab);
    return true;
  }, [args]);

  const openRevisionPanel = useCallback(() => {
    args.setFocusTab("revisions");
    if (!requestWorkpieceTabChange("history")) return;
    args.setMode("focus");
    args.resetRevisionSelection();
    void args.persistSession(args.activeDraftId, "list");
  }, [args, requestWorkpieceTabChange]);

  const closeRevisionPanel = useCallback(() => {
    args.setFocusTab("draft");
    requestWorkpieceTabChange("script");
    args.setMode("focus");
    args.resetRevisionSelection();
    void args.persistSession(args.activeDraftId, "draft");
  }, [args, requestWorkpieceTabChange]);

  useEffect(() => {
    if (!args.hasAnyUnsavedTab) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = args.tabSwitchUnsavedWarning;
      return args.tabSwitchUnsavedWarning;
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [args.hasAnyUnsavedTab, args.tabSwitchUnsavedWarning]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          if (!args.revisionModalOpen && args.hasActiveDraft) {
            args.openRevisionModal();
          }
          return;
        }
        void args.onSaveDraft();
      }

      if ((event.ctrlKey || event.metaKey) && key === "k") {
        event.preventDefault();
        args.searchRef.current?.focus();
        args.searchRef.current?.select();
      }

      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey) {
        const tabIndex = Number(key);
        if (Number.isInteger(tabIndex) && tabIndex >= 1 && tabIndex <= args.workpieceWorkspaceTabs.length) {
          event.preventDefault();
          if (!args.hasActiveEpisode) return;
          requestWorkpieceTabChange(args.workpieceWorkspaceTabs[tabIndex - 1]!);
        }
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    args.hasActiveDraft,
    args.hasActiveEpisode,
    args.onSaveDraft,
    args.openRevisionModal,
    args.revisionModalOpen,
    args.searchRef,
    args.workpieceWorkspaceTabs,
    requestWorkpieceTabChange,
  ]);

  return {
    requestWorkpieceTabChange,
    openRevisionPanel,
    closeRevisionPanel,
  };
}
