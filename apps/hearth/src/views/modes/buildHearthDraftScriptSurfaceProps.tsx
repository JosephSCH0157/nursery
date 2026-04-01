import type { ComponentProps, ReactNode, RefObject } from "react";
import ScriptSurface from "../surfaces/ScriptSurface";

type BuildHearthDraftScriptSurfacePropsInput = {
  visible: boolean;
  showScriptEditor: boolean;
  scriptPanelTitle: string;
  scriptPanelCopyMessage: string | null;
  scriptPanelCopyAcknowledged: boolean;
  scriptPanelHint: string | null;
  scriptPanelMetaText: string;
  scriptPanelBodyText: string;
  scriptPanelPlaceholder: string;
  isVisualScriptMode: boolean;
  visualScriptParagraphRail: {
    beatCount: number;
    globalCount: number;
    orphanedCount: number;
    paragraphs: Array<{
      paragraphId: string;
      density: string;
      label: string;
      count: number;
    }>;
  };
  isCanonicalImageMapScriptPanel: boolean;
  activeDraftExists: boolean;
  sourcesSummary: string;
  unusedSummary: string;
  canReviewSources: boolean;
  sttLane: "browser" | "ai";
  sttTarget: "chat" | "script";
  sttState: "idle" | "listening" | "transcribing";
  hasBrowserSpeech: boolean;
  sttNotice: string | null;
  sttError: string | null;
  bodyRef: RefObject<HTMLTextAreaElement | null>;
  copyIcon: ReactNode;
  listeningIndicator: ReactNode;
  onSetSttLane: (lane: "browser" | "ai") => void;
  onToggleScriptMic: () => void;
  onCopyScriptPanelText: () => void;
  onBodyChange: (value: string) => void;
  onBodyCompositionStart: () => void;
  onBodyCompositionEnd: () => void;
  onBodyCursorChange: (cursorPosition: number) => void;
  onBodyScrollChange: (scrollTop: number) => void;
  onReviewSources: () => void;
};

export function buildHearthDraftScriptSurfaceProps(
  input: BuildHearthDraftScriptSurfacePropsInput,
): ComponentProps<typeof ScriptSurface> {
  return {
    visible: input.visible,
    showScriptEditor: input.showScriptEditor,
    scriptPanelTitle: input.scriptPanelTitle,
    scriptPanelCopyMessage: input.scriptPanelCopyMessage,
    scriptPanelCopyAcknowledged: input.scriptPanelCopyAcknowledged,
    scriptPanelHint: input.scriptPanelHint,
    scriptPanelMetaText: input.scriptPanelMetaText,
    scriptPanelBodyText: input.scriptPanelBodyText,
    scriptPanelPlaceholder: input.scriptPanelPlaceholder,
    isVisualScriptMode: input.isVisualScriptMode,
    visualScriptParagraphRail: input.visualScriptParagraphRail,
    isCanonicalImageMapScriptPanel: input.isCanonicalImageMapScriptPanel,
    activeDraftExists: input.activeDraftExists,
    sourcesSummary: input.sourcesSummary,
    unusedSummary: input.unusedSummary,
    canReviewSources: input.canReviewSources,
    sttLane: input.sttLane,
    sttTarget: input.sttTarget,
    sttState: input.sttState,
    hasBrowserSpeech: input.hasBrowserSpeech,
    sttNotice: input.sttNotice,
    sttError: input.sttError,
    bodyRef: input.bodyRef,
    copyIcon: input.copyIcon,
    listeningIndicator: input.listeningIndicator,
    onSetSttLane: input.onSetSttLane,
    onToggleScriptMic: input.onToggleScriptMic,
    onCopyScriptPanelText: input.onCopyScriptPanelText,
    onBodyChange: input.onBodyChange,
    onBodyCompositionStart: input.onBodyCompositionStart,
    onBodyCompositionEnd: input.onBodyCompositionEnd,
    onBodyCursorChange: input.onBodyCursorChange,
    onBodyScrollChange: input.onBodyScrollChange,
    onReviewSources: input.onReviewSources,
  };
}
