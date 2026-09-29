import type { EpisodeWorkspaceReadModel } from "@forge/shared/episode-workspace";
import type { HearthFormatOnlyChangeCategory } from "../../lib/hearth-format-only";
import type { EpisodeContext, HearthOp } from "../../lib/hearth-ai-ops";
import type { HearthReadyScript } from "../../lib/hearth-ready-scripts";
import type { HearthWorkpieceSummary } from "../../lib/hearth-workpieces";
import type { WorkpieceWorkspaceTab } from "../../lib/hearth-workpiece-tab-shell";

export type HearthMode = "sparks" | "episodes" | "ready" | "series" | "focus";
export type UiDensity = "comfortable" | "compact";
export type FocusTab = "draft" | "planning" | "sources" | "revisions";
export type AiAutosaveReasonCode = "ai_outline" | "ai_script" | "ai_repair" | "ai_rewrite";
export type ProposalSaveReasonCode = AiAutosaveReasonCode | "format_only" | "deterministic_cleanup" | "user_editorial";
export type ProposalAutosaveReason = `autosave:${ProposalSaveReasonCode}`;
export type ForgeNoticeSeverity = "info" | "success" | "warning" | "error";
export type ForgeNoticeJob =
  | "image-generated"
  | "script-completed"
  | "sources-found"
  | "save-failed"
  | "render-finished"
  | "export-finished"
  | "job-failed";

export type ForgeNoticeDetail = {
  tool: "hearth";
  job: ForgeNoticeJob;
  title: string;
  message?: string;
  route?: string;
  workspaceId?: string;
  workpieceId?: string;
  severity: ForgeNoticeSeverity;
  timestamp: number;
};

export type ApprovalPersistenceStatus = {
  cloud: "ok";
  local: "ok" | "failed";
  localPath?: string;
  localMessage?: string;
};

export type HearthUserContext = {
  userId: string | null;
  displayName: string;
};

export type DraftConflictState = {
  message: string;
  localBody: string;
};

export type CanonicalImageMapScriptState = {
  status: "idle" | "loading" | "ready" | "error";
  text: string | null;
  source: "approved_script" | null;
  includesUnsavedLocalEdits: boolean;
  error: string | null;
};

export type SortKey = "updated" | "title";
export type ReadyUrgencyLevel = "fresh" | "warming" | "cooling" | "cold";
export type ReadyLabel = "hot" | "evergreen" | "series";

export type DraftSnapshot = {
  title: string;
  body: string;
  updatedAt: number;
};

export type DiffLine = {
  left: string;
  right: string;
  status: "same" | "changed" | "added" | "removed" | "separator";
};

export type PendingAiProposal = {
  assistantText: string;
  ops: HearthOp[];
  originalOps: HearthOp[];
  selected: boolean[];
  context: EpisodeContext;
  fromGate: boolean;
  autosaveReasonCode: ProposalSaveReasonCode;
  proposalOrigin: "ai" | "format_only" | "deterministic" | "user_editorial";
  deterministicAction: import("../../lib/hearth-deterministic-cleanup").HearthDeterministicAction | null;
  formatSourceBody: string | null;
  formatOriginalBody: string | null;
  formatChanges: HearthFormatOnlyChangeCategory[];
  persistedProposal: {
    proposalId: string;
    proposalState: "proposed";
    createdAt: string | null;
    operationId: string | null;
    sourcePaidResultId: string | null;
    expectedDraftRevision: number | null;
    expectedDraftHash: string | null;
    applicationStarted: boolean;
  } | null;
};

export type ChatAttachmentUi = {
  id: string;
  filename: string;
  mimeType: string;
  status: "uploading" | "reading" | "attached" | "failed" | "needs_text_extraction";
  error?: string | null;
};

export type HearthShellProps = {
  onEpisodeReadModelChange?: (readModel: EpisodeWorkspaceReadModel | null) => void;
  onEpisodeContextLoadingChange?: (episodeId: string | null) => void;
};

export const AUTOSAVE_DELAY_MS = 2200;
export const AUTOSAVE_MIN_GAP_MS = 5000;
export const AUTOSAVE_REVISION_GAP_MS = 5 * 60 * 1000;
export const SESSION_SAVE_DELAY_MS = 500;
export const CHAT_HISTORY_WRITE_DEBOUNCE_MS = 350;
export const AI_STT_MAX_DURATION_MS = 5 * 60 * 1000;
export const AI_STT_MAX_BYTES = 10 * 1024 * 1024;
export const STT_INLINE_FEEDBACK_MS = 2200;
export const STT_PREVIEW_MAX_CHARS = 80;
export const PRESENCE_HEARTBEAT_MS = 25_000;

export const TONE_PRESET_OPTIONS = [
  { value: "neutral_conversational", label: "Neutral conversational" },
  { value: "newsroom_neutral", label: "Newsroom neutral" },
  { value: "spicy_but_safe", label: "Spicy but safe" },
] as const;
export const DEFAULT_TONE_PRESET = "neutral_conversational";
export const FORGE_NOTICE_EVENT = "forge:notice";
export const TAB_SWITCH_UNSAVED_WARNING = "You have unsaved changes in this tab. Switch anyway?";
export const EMPTY_WORKPIECE_SUMMARY_LIST: HearthWorkpieceSummary[] = [];
export const EMPTY_READY_SCRIPT_LIST: HearthReadyScript[] = [];
export const WORKPIECE_WORKSPACE_TABS: WorkpieceWorkspaceTab[] = [
  "script",
  "visuals",
  "metadata",
  "release",
  "history",
];
export const SCRIPT_TAG_VALIDATOR_VERSION = "shared-script-tags-v1";
export const LEGACY_DRAFT_SCRIPT_PLACEHOLDER = "## Draft Script";
export const SAFE_SCRIPT_STARTER = "[s1]\nDraft intro goes here.\n[/s1]\n";
