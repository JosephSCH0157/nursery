import type { ReactNode } from "react";
import ChatSurface from "../surfaces/ChatSurface";
import HistorySurface from "../surfaces/HistorySurface";
import ScriptSurface from "../surfaces/ScriptSurface";
import WorkpieceTabBar from "../surfaces/WorkpieceTabBar";

type HearthDraftModeProps = {
  scriptHeader: ReactNode;
  workpieceTabProps: React.ComponentProps<typeof WorkpieceTabBar>;
  draftStageClassName: string;
  chatSurfaceProps: React.ComponentProps<typeof ChatSurface>;
  productionContent: ReactNode;
  historyVisible: boolean;
  revisionsContent: ReactNode;
  scriptSurfaceProps: React.ComponentProps<typeof ScriptSurface>;
};

export default function HearthDraftMode({
  scriptHeader,
  workpieceTabProps,
  draftStageClassName,
  chatSurfaceProps,
  productionContent,
  historyVisible,
  revisionsContent,
  scriptSurfaceProps,
}: HearthDraftModeProps) {
  return (
    <section className="hs-draft hs-draft-chat-first">
      {scriptHeader}

      <WorkpieceTabBar {...workpieceTabProps} />

      <div className={draftStageClassName}>
        <div className="hs-focus-stack">
          <ChatSurface {...chatSurfaceProps} />
          {productionContent}
        </div>

        <HistorySurface visible={historyVisible}>
          {revisionsContent}
        </HistorySurface>

        <ScriptSurface {...scriptSurfaceProps} />
      </div>
    </section>
  );
}
