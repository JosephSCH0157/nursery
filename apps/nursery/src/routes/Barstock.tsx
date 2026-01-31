import { useCallback } from "react";
import { useOutletContext } from "react-router-dom";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import type { Workspace } from "@barstock/lib/tongs-api";
import BarstockApp from "@barstock/App";
import { mirrorRoleSnapshot, isAutoMirrorEnabled, loadLastMirrorStatus } from "../lib/mirror";
import { loadMountRegistry } from "../lib/mount-registry";
import { resolveMount } from "@forge/tongs";

type AppShellContext = {
  workspaceId: string | null;
  workspaces: Workspace[];
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: (opts?: { force?: boolean; preferId?: string | null }) => Promise<void>;
  session: SupabaseSession | null;
};

const AUTO_MIRROR_DEBOUNCE_MS = 10_000;

export default function BarstockRoute() {
  const ctx = useOutletContext<AppShellContext>();
  const workspaceId = ctx.workspaceId;

  const onSessionEnd = useCallback((sessionId: string) => {
    if (!workspaceId) return;
    if (!sessionId) return;
    if (!isAutoMirrorEnabled(workspaceId, "barstock")) return;

    void (async () => {
      const { registry } = loadMountRegistry("default");
      const mirrorVaultKey = resolveMount(registry, "barstock").mirrorTarget?.vaultKey;
      const last = loadLastMirrorStatus(workspaceId, "barstock", mirrorVaultKey);
      if (last?.at) {
        const lastAt = new Date(last.at).getTime();
        if (!Number.isNaN(lastAt) && Date.now() - lastAt < AUTO_MIRROR_DEBOUNCE_MS) {
          return;
        }
      }

      try {
        await mirrorRoleSnapshot("barstock", workspaceId, "session_end", { sessionId });
      } catch (err) {
        console.warn("[barstock] session-end mirror failed", err);
      }
    })();
  }, [workspaceId]);

  return (
    <BarstockApp
      workspaceState={{
        workspaces: ctx.workspaces,
        workspaceId: ctx.workspaceId,
        onWorkspaceChange: ctx.selectWorkspace,
      }}
      showWorkspacePicker={false}
      onSessionEnd={onSessionEnd}
    />
  );
}
