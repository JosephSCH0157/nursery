import type { ReactNode } from "react";

type HearthDesktopRailContentProps = {
  deferDesktopRailCollections: boolean;
  readyQueueRail: ReactNode;
  workspaceProjectsRail: ReactNode;
  activeWorkpieceRail: ReactNode;
};

export default function HearthDesktopRailContent({
  deferDesktopRailCollections,
  readyQueueRail,
  workspaceProjectsRail,
  activeWorkpieceRail,
}: HearthDesktopRailContentProps) {
  return (
    <>
      {deferDesktopRailCollections ? (
        <div className="hs-rail-section">
          <div className="hs-rail-heading">Workspace Queue</div>
          <div className="hs-rail-meta">
            Ready items and workspace projects load after you open or start an Episode.
          </div>
        </div>
      ) : (
        <>
          {readyQueueRail}
          {workspaceProjectsRail}
        </>
      )}

      {activeWorkpieceRail}
    </>
  );
}
