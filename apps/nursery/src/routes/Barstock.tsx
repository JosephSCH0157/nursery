import { useMemo } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import BarstockApp from "@barstock/App";
import { MobilePage, useLayoutMode } from "@forge/ui-mobile";
import type { AppShellContext } from "./AppShell";
import WorkspaceRequiredNotice from "./WorkspaceRequiredNotice";

type BarstockMobileRoute = {
  mode: "list" | "new" | "detail";
  sparkId?: string;
};

function parseBarstockMobileRoute(pathname: string): BarstockMobileRoute {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "app") return { mode: "list" };
  if (parts[1] !== "barstock" && parts[1] !== "bar-stock") return { mode: "list" };
  if (parts[2] !== "sparks") return { mode: "list" };
  if (parts[3] === "new") return { mode: "new" };
  if (parts[3]) return { mode: "detail", sparkId: decodeURIComponent(parts[3]) };
  return { mode: "list" };
}

export default function BarstockRoute() {
  const ctx = useOutletContext<AppShellContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const layoutMode = useLayoutMode();
  const pathParts = location.pathname.split("/").filter(Boolean);
  const toolSegment = pathParts[1] === "bar-stock" ? "bar-stock" : "barstock";
  const basePath = `/app/${toolSegment}`;
  const mobileRoute = useMemo(() => parseBarstockMobileRoute(location.pathname), [location.pathname]);
  const isMobileLayout = layoutMode === "mobile";

  const pushPath = (path: string) => {
    const search = location.search ?? "";
    navigate(`${path}${search}`);
  };

  if (!ctx.workspaceId) {
    return <WorkspaceRequiredNotice toolName="Barstock" />;
  }

  return (
    <BarstockApp
      workspaceState={{
        workspaces: ctx.workspaces,
        workspaceId: ctx.workspaceId,
        onWorkspaceChange: ctx.selectWorkspace,
        isCloudConnected: ctx.cloud.status === "connected",
      }}
      showWorkspacePicker={false}
      mobileRoute={isMobileLayout
        ? {
          mode: mobileRoute.mode,
          sparkId: mobileRoute.sparkId,
          onOpenSpark: (sparkId: string) => pushPath(`${basePath}/sparks/${encodeURIComponent(sparkId)}`),
          onOpenNew: () => pushPath(`${basePath}/sparks/new`),
          onBackToList: () => pushPath(basePath),
        }
        : null}
      renderMobilePage={(page) => (
        <MobilePage
          title={page.title}
          onBack={page.onBack}
          showBack={page.showBack}
          rightAction={page.rightAction}
          bottomBar={page.bottomBar}
        >
          {page.children}
        </MobilePage>
      )}
    />
  );
}
