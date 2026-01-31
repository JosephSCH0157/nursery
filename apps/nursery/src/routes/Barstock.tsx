import { useOutletContext } from "react-router-dom";
import type { Session as SupabaseSession } from "@supabase/supabase-js";
import type { Workspace } from "@barstock/lib/tongs-api";
import BarstockApp from "@barstock/App";

type AppShellContext = {
  workspaceId: string | null;
  workspaces: Workspace[];
  selectWorkspace: (id: string | null) => void;
  refreshWorkspaces: (opts?: { force?: boolean; preferId?: string | null }) => Promise<void>;
  session: SupabaseSession | null;
};

export default function BarstockRoute() {
  const ctx = useOutletContext<AppShellContext>();
  return (
    <BarstockApp
      workspaceState={{
        workspaces: ctx.workspaces,
        workspaceId: ctx.workspaceId,
        onWorkspaceChange: ctx.selectWorkspace,
      }}
      showWorkspacePicker={false}
    />
  );
}
