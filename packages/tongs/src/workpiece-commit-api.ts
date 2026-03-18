import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "./db.types.js";
import {
  OpenAiImageProvider,
  type GenerateImageInput,
  type ImageProvider,
} from "./providers/image-provider.js";
import {
  buildHearthVisualStylePromptLines,
  normalizeHearthVisualStyle,
} from "./hearth-visual-styles.js";
import type { HearthVisualStyleValue } from "./hearth-visual-styles.js";
import type { RecordingSessionDTO, RecordingSessionItemDTO } from "./types.js";
import { ALL_MOUNT_ROLES, type MountRole } from "./storage/storage-contract.js";
import {
  resolveWorkspaceCloudListingPrefixes,
  resolveWorkspaceCloudReadCandidates,
  resolveWorkspaceCloudWriteTarget,
} from "./storage/cloud-prefix.js";

export const TONGS_WORKPIECE_BUCKET = "forge-workpieces";

const MANIFEST_PATH = "manifest.json";
const SHA256_ALGO = "sha256";
const DEFAULT_ORIGIN_TOOL = { name: "tongs", version: "0.1.0" } as const;
const DEFAULT_WRITTEN_BY = { tool: "tongs", tool_version: "0.1.0", lane: "forge-managed" } as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BOOTSTRAP_WORKPIECE_PATHS = new Set([
  "script/script.md",
  "script/session.json",
  "script/script.sources.json",
  "hearth/drafts.v1.json",
  "hearth/chat.v1.json",
  "hearth/revisions.v1.json",
]);
const BOOTSTRAP_WORKSPACE_PATHS = new Set(["sources/index.json"]);
const READY_SCRIPT_PATH_CANDIDATES = [
  "script/script.published.md",
  "script/script.md",
  "scripts/script.anvil.txt",
  "scripts/script.source.md",
] as const;
const READY_SCRIPT_PATH_SET = new Set<string>(READY_SCRIPT_PATH_CANDIDATES as readonly string[]);
const TAKE_KEPT_EVENT = "take_kept";
const CONTENT_CATEGORY_EVENT = "hearth.content_category.set.v1";
const CONTENT_CATEGORY_VALUES = [
  "evergreen",
  "hot_topic",
  "viral_reaction",
  "strategic_anchor",
  "community",
  "reflective",
  "explainer",
  "experimental",
  "backup",
] as const;
const CONTENT_CATEGORY_SET = new Set<string>(CONTENT_CATEGORY_VALUES as readonly string[]);
const RECORDING_SESSION_STATUS_VALUES = ["planned", "active", "completed", "canceled"] as const;
const RECORDING_SESSION_STATUS_SET = new Set<string>(RECORDING_SESSION_STATUS_VALUES);
const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};
const THUMBNAIL_ASSET_PREFIX = "assets/thumbnails";
const THUMBNAIL_ASSET_KIND = "thumbnail_image" as const;
const THUMBNAIL_ASSET_SCHEMA = "forge.thumbnail-image.v1" as const;
const THUMBNAIL_EDITORIAL_BASE_HINT = "Clean, high-contrast YouTube thumbnail composition.";
const IMAGE_MAP_ASSET_PATH = "assets/image-map/image-map.v1.json";
const IMAGE_MAP_ASSET_KIND = "image_map_json" as const;
const IMAGE_MAP_ASSET_SCHEMA = "forge.image-map.v1" as const;
const IMAGE_MAP_CANDIDATE_ASSET_KIND = "image_map_candidate_image" as const;
const IMAGE_MAP_CANDIDATE_ASSET_SCHEMA = "forge.image-map-candidate.v1" as const;
const IMAGE_MAP_CANDIDATE_ASSET_PREFIX = "assets/image-map/candidates";
const IMAGE_MAP_INTENT_VALUES = ["broll", "graphic", "lower-third", "archival", "cutaway", "other"] as const;
const IMAGE_MAP_INTENT_SET = new Set<string>(IMAGE_MAP_INTENT_VALUES);
const IMAGE_MAP_SOURCE_TYPE_VALUES = ["ai", "stock", "archival", "custom"] as const;
const IMAGE_MAP_SOURCE_TYPE_SET = new Set<string>(IMAGE_MAP_SOURCE_TYPE_VALUES);
const IMAGE_MAP_STATUS_VALUES = ["draft", "mapped", "candidates_generated", "selected"] as const;
const IMAGE_MAP_STATUS_SET = new Set<string>(IMAGE_MAP_STATUS_VALUES);
const IMAGE_MAP_VISUAL_MODE_VALUES = [
  "comparison",
  "map",
  "location",
  "event_scene",
  "concept_illustration",
  "person_figure",
  "object_detail",
] as const;
const IMAGE_MAP_VISUAL_MODE_SET = new Set<string>(IMAGE_MAP_VISUAL_MODE_VALUES);
const HAMMER_PREP_STATUS_VALUES = ["idle", "preparing", "prepared", "prep_failed"] as const;
const HAMMER_PREP_STATUS_SET = new Set<string>(HAMMER_PREP_STATUS_VALUES);
const HAMMER_ALIGNMENT_STATUS_VALUES = ["not_started", "pending", "aligned", "needs_review"] as const;
const HAMMER_ALIGNMENT_STATUS_SET = new Set<string>(HAMMER_ALIGNMENT_STATUS_VALUES);
const STORAGE_LIST_MAX_DEPTH = 3;
const STORAGE_LIST_MAX_ITEMS_PER_DIRECTORY = 80;
const HAMMER_ARTIFACT_PATHS = {
  editor_session: "hammer/session/editor-state.v1.json",
  structured_transcript: "hammer/transcript/structured.v1.json",
  speaker_map: "hammer/transcript/speaker-map.v1.json",
  visual_placements: "hammer/prep/visual-placements.v1.json",
  audio_polish: "hammer/prep/audio-polish.v1.json",
  edit_plan: "hammer/edit-plan/current.v1.json",
} as const;
const HAMMER_ARTIFACT_EVENT_NAMES = {
  editor_session: "hammer.editor-session.saved.v1",
  structured_transcript: "hammer.transcript.saved.v1",
  speaker_map: "hammer.speaker-map.saved.v1",
  visual_placements: "hammer.visual-placements.saved.v1",
  audio_polish: "hammer.audio-polish.saved.v1",
  edit_plan: "hammer.edit-plan.saved.v1",
} as const;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type AssetRow = Database["tongs"]["Tables"]["assets"]["Row"];
type EpisodeRow = Database["tongs"]["Tables"]["episodes"]["Row"];
type RecordingSessionRow = Database["tongs"]["Tables"]["recording_sessions"]["Row"];
type RecordingSessionEpisodeRow = Database["tongs"]["Tables"]["recording_session_episodes"]["Row"];
type RecordingSessionItemRow = Database["tongs"]["Tables"]["recording_session_items"]["Row"];
type CalendarEventAssignmentRow = Database["tongs"]["Tables"]["calendar_event_assignments"]["Row"];
type HearthWorkpiecePresenceRow = Database["tongs"]["Tables"]["hearth_workpiece_presence"]["Row"];
type HammerWorkpiecePresenceRow = Database["tongs"]["Tables"]["hammer_workpiece_presence"]["Row"];
type HammerWorkpieceStateRow = Database["tongs"]["Tables"]["hammer_workpiece_state"]["Row"];
type WorkpieceFileRow = Database["tongs"]["Tables"]["workpiece_files"]["Row"];
type WorkpieceEventRow = Database["tongs"]["Tables"]["workpiece_events"]["Row"];
type WorkspaceRow = Database["tongs"]["Tables"]["workspaces"]["Row"];
type WorkspaceReadyQueueStateRow = Database["tongs"]["Tables"]["workspace_ready_queue_state"]["Row"];

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };
type WorkspaceRole = "viewer" | "editor" | "admin" | "owner";

type ManifestPointerKey =
  | "script_primary"
  | "script_format"
  | "script_sources"
  | "assets_registry"
  | "session_current"
  | "edit_current"
  | "export_current"
  | "publish_intent";

const MANIFEST_POINTER_KEYS: readonly ManifestPointerKey[] = [
  "script_primary",
  "script_format",
  "script_sources",
  "assets_registry",
  "session_current",
  "edit_current",
  "export_current",
  "publish_intent",
] as const;

const MANIFEST_POINTER_KEY_SET = new Set<ManifestPointerKey>(MANIFEST_POINTER_KEYS);

type ManifestFileEntry = {
  type: string;
  content_type: string;
  bytes: number;
  hash: {
    algo: "sha256";
    value: string;
  };
  written_by: WrittenBy;
  updated_at: string;
};

type WorkpieceManifest = {
  schema: "forge.manifest.v1";
  workpiece_id: string;
  workspace_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  pointers: Record<ManifestPointerKey, string | null>;
  hashing: {
    algo: "sha256";
    text_newlines: "LF";
    json: {
      sorted_keys: true;
      minified: true;
      preserve_array_order: true;
    };
  };
  origin: {
    created_by: {
      user_id: string | null;
      display_name: string | null;
    };
    tool: {
      name: string;
      version: string;
    };
  };
  files: Record<string, ManifestFileEntry>;
};

export type WrittenBy = {
  tool: string;
  tool_version: string;
  lane: string;
};

export type CreateCradleRequest = {
  workspace_id: string;
  cradle_id?: string;
  status?: string;
  metadata?: Json;
  created_by?: {
    user_id?: string | null;
    display_name?: string | null;
  };
  origin_tool?: {
    name: string;
    version: string;
  };
  written_by?: WrittenBy;
  correlation_id?: string;
};

export type CreateCradleResponse = {
  cradle: EpisodeRow;
  manifest_hash: string;
  manifest_bytes: number;
  files_indexed: number;
  event: WorkpieceEventRow;
};

export type CommitFileRequest = {
  path: string;
  content_type?: string;
  file_type?: string;
  written_by: WrittenBy;
  pointer?: ManifestPointerKey;
  event_name?: string;
  event_payload?: Json;
  correlation_id?: string;
  text?: string;
  json?: unknown;
  content?: unknown;
  bytes_base64?: string;
  content_base64?: string;
  jsonl_append?: unknown;
  user_access_token?: string | null;
  expected_previous_updated_at?: string;
};

export type CommitFileResponse = {
  workpiece_id: string;
  path: string;
  storage_key: string;
  hash: string;
  bytes: number;
  content_type: string;
  manifest_hash: string;
  manifest_bytes: number;
  file_row: WorkpieceFileRow;
  manifest_row: WorkpieceFileRow;
  event: WorkpieceEventRow;
};

export type CommitWorkspaceFileResponse = {
  workspace_id: string;
  path: string;
  storage_key: string;
  hash: string;
  bytes: number;
  content_type: string;
};

export type ReadJsonFileResult =
  | { found: true; data: unknown; file_row: { updated_at: string | null } | null }
  | { found: false };

export type ReadTextFileResult =
  | { found: true; text: string; file_row: { updated_at: string | null } | null }
  | { found: false };

export type ReadBinaryFileResult =
  | { found: true; bytes_base64: string; content_type: string }
  | { found: false };

export type AppendEventRequest = {
  event_name: string;
  payload?: Json;
  correlation_id?: string;
  written_by: WrittenBy;
};

export type WorkpieceTakeReceipt = {
  event_id: number;
  created_at: string;
  file_path: string | null;
  recording_session_id: string | null;
  anvil_capture_session_id: string | null;
  content_type: string | null;
  bytes: number | null;
  duration_ms: number | null;
  original_name: string | null;
};

export type WorkpieceRecordingTruth = {
  workpiece_id: string;
  recorded: boolean;
  latest_kept_take: WorkpieceTakeReceipt | null;
};

export type RecordingSessionStatus = (typeof RECORDING_SESSION_STATUS_VALUES)[number];

export type CreateRecordingSessionRequest = {
  title: string;
  starts_at: string;
  ends_at?: string | null;
  calendar_event_id?: string | null;
};

export type UpdateRecordingSessionRequest = {
  title?: string;
  starts_at?: string;
  ends_at?: string | null;
  status?: RecordingSessionStatus;
};

export type RecordingSessionListRange = {
  starts_at?: string;
  ends_at?: string;
  limit?: number;
};

export type AttachEpisodeToSessionRequest = {
  episode_id: string;
  position?: number;
  notes?: string | null;
};

export type SessionEpisodeListItem = RecordingSessionEpisodeRow & {
  episode: Pick<EpisodeRow, "id" | "workspace_id" | "label" | "created_at" | "updated_at"> | null;
};

export type CreateRecordingSessionRecordRequest = {
  workspace_id: string;
  title?: string;
  calendar_event_id?: string | null;
};

export type RecordingSessionListOptions = {
  workspace_id?: string;
  limit?: number;
};

export type AttachCalendarEventAssignmentRequest = {
  assignment_id: string;
};

export type HearthPresenceMode = "viewing" | "editing";
export type HammerPresenceMode = "viewing" | "editing";
export type HammerPrepStatus = (typeof HAMMER_PREP_STATUS_VALUES)[number];
export type HammerAlignmentStatus = (typeof HAMMER_ALIGNMENT_STATUS_VALUES)[number];

export type UpsertHearthWorkpiecePresenceRequest = {
  mode: HearthPresenceMode;
  display_name?: string | null;
};

export type UpsertHammerWorkpiecePresenceRequest = {
  mode: HammerPresenceMode;
  display_name?: string | null;
  session_id?: string | null;
};

export type HammerArtifactKey = keyof typeof HAMMER_ARTIFACT_PATHS;

export type HammerArtifactWriteRequest = {
  path?: string;
  expected_previous_updated_at?: string | null;
  data: unknown;
};

export type SaveHammerWorkpieceStateRequest = {
  written_by: WrittenBy;
  active_session_id?: string | null;
  prep_status?: HammerPrepStatus;
  alignment_status?: HammerAlignmentStatus;
  last_opened_at?: string;
  edit_plan_signature?: string | null;
  macro_recipe_ref?: string | null;
  last_macro_run_ref?: string | null;
  editor_session?: HammerArtifactWriteRequest;
  structured_transcript?: HammerArtifactWriteRequest;
  speaker_map?: HammerArtifactWriteRequest;
  visual_placements?: HammerArtifactWriteRequest;
  audio_polish?: HammerArtifactWriteRequest;
  edit_plan?: HammerArtifactWriteRequest;
};

export type HammerPersistedArtifactRecord = {
  path: string | null;
  file_updated_at: string | null;
  data: unknown | null;
};

export type HammerPersistenceSnapshot = {
  schema_version: 1;
  state: HammerWorkpieceStateRow | null;
  editor_session: HammerPersistedArtifactRecord;
  structured_transcript: HammerPersistedArtifactRecord;
  speaker_map: HammerPersistedArtifactRecord;
  visual_placements: HammerPersistedArtifactRecord;
  audio_polish: HammerPersistedArtifactRecord;
  edit_plan: HammerPersistedArtifactRecord;
  macro_hooks: {
    recipe_ref: string | null;
    last_run_ref: string | null;
  };
};

export type ReplaceRecordingSessionItemsRequest = {
  items: Array<{
    episode_id: string;
    script_path: string;
  }>;
};

export type RecordingSessionRecord = RecordingSessionDTO;

export type ThumbnailVersionRecord = {
  id: string;
  concept_id: string;
  created_at: string;
  provider: string;
  prompt: string;
  provider_request_id: string | null;
  asset_id: string;
  asset_path: string | null;
  mime_type: string | null;
  status: "ready" | "failed";
  error: string | null;
};

export type EpisodeThumbnailConceptRecord = {
  id: string;
  label: string;
  prompt_text: string;
  style_preset: HearthVisualStyleValue | null;
};

export type EpisodeImageMapScriptAnchorRecord = {
  section_id: string;
  paragraph_id: string;
  paragraph_order: number;
  sentence_start: number;
  sentence_end: number;
  char_start: number;
  char_end: number;
  span_text: string;
  speaker_block_id?: string | null;
};

export type EpisodeImageMapAssetRefRecord = {
  asset_id: string;
  path?: string | null;
  variant_label?: string | null;
  visual_mode?: string | null;
  mime_type?: string | null;
};

export type EpisodeImageMapEntryRecord = {
  id: string;
  anchor: string;
  script_anchor: EpisodeImageMapScriptAnchorRecord | null;
  description: string;
  visual_intent: string;
  prompt_basis: string;
  style_preset: HearthVisualStyleValue | null;
  intent: string;
  source_type: string;
  beat_order: number;
  paragraph_beat_order: number;
  candidate_assets: EpisodeImageMapAssetRefRecord[];
  selected_asset_id: string | null;
  status: string;
  placement_hint?: string | null;
};

export type EpisodePackageRecord = {
  schema: "forge.episode.package.v2";
  seo: {
    titles: JsonValue[];
    tags: string[];
    description_short: string | null;
    description_long: string | null;
  };
  thumbnail: {
    concepts: EpisodeThumbnailConceptRecord[];
    versions: ThumbnailVersionRecord[];
    primary_version_id: string | null;
  };
  launch_variants: JsonValue[];
  image_map: {
    entries: EpisodeImageMapEntryRecord[];
  };
};

export type ImageMapAssetSummary = {
  id: string;
  asset_kind: typeof IMAGE_MAP_ASSET_KIND;
  status: "ready";
  path: typeof IMAGE_MAP_ASSET_PATH;
  storage_bucket: string;
  storage_key: string;
  metadata_json: {
    schema: typeof IMAGE_MAP_ASSET_SCHEMA;
    entry_count: number;
  };
  created_at: string;
  updated_at: string;
  supersedes_asset_id: string | null;
};

export type WorkpieceImageMapResponseData = {
  image_map: {
    workpiece_id: string;
    workspace_id: string;
    entries: EpisodeImageMapEntryRecord[];
    metadata_updated_at: string | null;
  };
  asset: ImageMapAssetSummary | null;
};

export type WorkpieceVisualPackageSelectedAsset = {
  asset_id: string;
  path: string;
  storage_bucket: string;
  storage_key: string;
  mime_type: string;
  bytes: number;
  created_at: string;
  updated_at: string;
  variant_label: string | null;
  visual_mode: string | null;
};

export type WorkpieceVisualPackageVisual = {
  entry_id: string;
  beat_order: number;
  paragraph_beat_order: number;
  status: string;
  script_anchor: EpisodeImageMapScriptAnchorRecord | null;
  visual_mode: string | null;
  selected_asset_id: string | null;
  selected_asset: WorkpieceVisualPackageSelectedAsset | null;
};

export type WorkpieceVisualPackageResponseData = {
  workspace_id: string;
  workpiece_id: string;
  script_path: string | null;
  script_updated_at: string | null;
  image_map_updated_at: string | null;
  image_map_asset_updated_at: string | null;
  visuals: WorkpieceVisualPackageVisual[];
};

export type SaveWorkpieceImageMapRequest = {
  workspace_id: string;
  entries: EpisodeImageMapEntryRecord[];
  expected_metadata_updated_at?: string | null;
};

export type GenerateImageMapCandidatesRequest = {
  workspace_id: string;
  image_map_entry_id: string;
  expected_metadata_updated_at?: string | null;
  context_before?: string | null;
  context_after?: string | null;
  aspect?: string | null;
  size?: string | null;
  lane?: "forge" | "byo";
  confirm_spend?: boolean;
  always_approve_ai_spend?: boolean;
  user_access_token?: string | null;
};

export type ImageMapCandidateAssetSummary = {
  id: string;
  workspace_id: string;
  episode_id: string;
  image_map_entry_id: string;
  path: string;
  storage_bucket: string;
  storage_key: string;
  mime_type: string;
  bytes: number;
  provider: string;
  provider_request_id: string | null;
  request_id: string;
  variant_label: string;
  visual_mode: string;
  prompt: string;
  status: "ready";
};

export type GenerateImageMapCandidatesResponse = {
  image_map: WorkpieceImageMapResponseData["image_map"];
  asset: WorkpieceImageMapResponseData["asset"];
  generated_assets: ImageMapCandidateAssetSummary[];
  credits_warning?: string;
  token_balance?: number | null;
};

export type GenerateEpisodeThumbnailRequest = {
  workspace_id: string;
  episode_id: string;
  concept_id?: string;
  prompt?: string;
  preset?: string | null;
  aspect?: string | null;
  size?: string | null;
  lane?: "forge" | "byo";
  confirm_spend?: boolean;
  always_approve_ai_spend?: boolean;
  user_access_token?: string | null;
};

export type GenerateEpisodeThumbnailResponse = {
  version: ThumbnailVersionRecord;
  asset: {
    id: string;
    workspace_id: string;
    episode_id: string;
    path: string;
    storage_bucket: string;
    storage_key: string;
    mime_type: string;
    bytes: number;
    provider: string;
    provider_request_id: string | null;
    request_id: string;
  };
  updated_episode_package: EpisodePackageRecord;
  primary_version_id: string | null;
  credits_warning?: string;
  token_balance?: number | null;
};

export type WorkspaceReadyScript = {
  workspace_id: string;
  workpiece_id: string;
  path: string;
  primary_script_path: string;
  script_paths: string[];
  title: string;
  updated_at: string;
  content_category: string | null;
  marked_ready_by: string | null;
  marked_ready_at: string | null;
  queue_rank: number | null;
  hidden_at: string | null;
  hidden_by: string | null;
};

export type WorkspaceSparkSummary = {
  id: string;
  workspace_id: string;
  assignment_id: string | null;
  title: string | null;
  body: string;
  tags: string[];
  status: string;
  created_at: string;
  updated_at: string;
  linked_workpiece_id: string | null;
};

export type WorkspaceEpisodeSummary = Pick<
  EpisodeRow,
  "id" | "workspace_id" | "label" | "created_at" | "updated_at" | "archived_at" | "archived_by" | "archive_reason"
>;

export type ListWorkspaceSparksOptions = {
  userAccessToken?: string | null;
};

export type ListWorkspaceEpisodesOptions = {
  includeArchived?: boolean;
  userAccessToken?: string | null;
};

export type WorkspaceStorageTreeNode = {
  name: string;
  kind: "directory" | "file";
  path: string;
  bytes?: number | null;
  updated_at?: string | null;
  children?: WorkspaceStorageTreeNode[];
  note?: string;
};

export type WorkspaceStorageListing = {
  source: {
    kind: "cloud_canonical";
    bucket: string;
    workspace_id: string;
    role: MountRole;
    prefix: string | null;
    root_path: string;
  };
  nodes: WorkspaceStorageTreeNode[];
};

export type WorkpieceStorageListing = {
  source: {
    kind: "cloud_workpiece";
    bucket: string;
    workspace_id: string;
    workpiece_id: string;
    prefix: string | null;
    root_path: string;
  };
  nodes: WorkspaceStorageTreeNode[];
};

export type WorkspaceCanonicalRecordingListing = {
  source: {
    kind: "cloud_workpiece_recordings";
    bucket: string;
    workspace_id: string;
    root_path: string;
  };
  nodes: WorkspaceStorageTreeNode[];
};

export type ListWorkspaceStorageOptions = {
  prefix?: string | null;
  depth?: number;
  userAccessToken?: string | null;
};

export type ListWorkpieceStorageOptions = {
  prefix?: string | null;
  depth?: number;
  userAccessToken?: string | null;
};

export type ListWorkspaceCanonicalRecordingsOptions = {
  includeArchived?: boolean;
  userAccessToken?: string | null;
};

export type ArchiveWorkpieceRequest = {
  workspace_id: string;
  reason?: string | null;
};

export type RestoreWorkpieceRequest = {
  workspace_id: string;
};

export type ListWorkspaceReadyScriptsOptions = {
  unrecordedOnly?: boolean;
  includeHidden?: boolean;
  userAccessToken?: string | null;
};

export type DeleteReadyScriptOptions = {
  userAccessToken?: string | null;
};

export type WorkspaceReadyQueueStateEntry = {
  workpiece_id: string;
  queue_rank?: number | null;
  hidden?: boolean | null;
};

export type UpdateWorkspaceReadyQueueStateRequest = {
  entries: WorkspaceReadyQueueStateEntry[];
};

export type UpdateWorkspaceReadyQueueStateResult = {
  updated_count: number;
  deleted_count: number;
};

export type DeleteReadyScriptResult = {
  workpiece_id: string;
  path: string;
  deleted: boolean;
  already_deleted: boolean;
  removed_session_item_count: number;
  ready_meta_deleted: boolean;
  warnings: string[];
};

export type TongsCommitApiOptions = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  bucket?: string;
  apiToken?: string;
  openAiImageApiKey?: string;
  openAiApiKey?: string;
  openAiImageModel?: string;
};

export type TongsCommitApiService = {
  createCradle(input: CreateCradleRequest): Promise<CreateCradleResponse>;
  commitFile(workpieceId: string, input: CommitFileRequest): Promise<CommitFileResponse>;
  commitWorkspaceFile(workspaceId: string, input: CommitFileRequest): Promise<CommitWorkspaceFileResponse>;
  deleteReadyScript(workpieceId: string, path: string, options?: DeleteReadyScriptOptions): Promise<DeleteReadyScriptResult>;
  generateEpisodeThumbnail(workpieceId: string, input: GenerateEpisodeThumbnailRequest): Promise<GenerateEpisodeThumbnailResponse>;
  createRecordingSessionRecord(input: CreateRecordingSessionRecordRequest): Promise<RecordingSessionRow>;
  listRecordingSessionsForPlanner(options?: RecordingSessionListOptions): Promise<RecordingSessionRow[]>;
  getRecordingSessionRecord(sessionId: string): Promise<RecordingSessionRecord>;
  replaceRecordingSessionItems(sessionId: string, input: ReplaceRecordingSessionItemsRequest): Promise<RecordingSessionItemDTO[]>;
  createRecordingSession(workspaceId: string, input: CreateRecordingSessionRequest): Promise<RecordingSessionRow>;
  updateRecordingSession(sessionId: string, patch: UpdateRecordingSessionRequest): Promise<RecordingSessionRow>;
  deleteRecordingSession(sessionId: string): Promise<void>;
  listRecordingSessions(workspaceId: string, range?: RecordingSessionListRange): Promise<RecordingSessionRow[]>;
  listCalendarEventAssignmentsForEvent(
    workspaceId: string,
    calendarEventId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<CalendarEventAssignmentRow[]>;
  listHearthWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HearthWorkpiecePresenceRow[]>;
  upsertHearthWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    input: UpsertHearthWorkpiecePresenceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HearthWorkpiecePresenceRow>;
  readHammerWorkpieceState(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerPersistenceSnapshot>;
  saveHammerWorkpieceState(
    workspaceId: string,
    workpieceId: string,
    input: SaveHammerWorkpieceStateRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerPersistenceSnapshot>;
  listHammerWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerWorkpiecePresenceRow[]>;
  upsertHammerWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    input: UpsertHammerWorkpiecePresenceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerWorkpiecePresenceRow>;
  attachCalendarEventAssignment(
    workspaceId: string,
    calendarEventId: string,
    input: AttachCalendarEventAssignmentRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<CalendarEventAssignmentRow>;
  detachCalendarEventAssignment(
    workspaceId: string,
    calendarEventId: string,
    assignmentId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<{ detached: boolean }>;
  attachEpisodeToSession(sessionId: string, input: AttachEpisodeToSessionRequest): Promise<RecordingSessionEpisodeRow>;
  detachEpisodeFromSession(sessionId: string, episodeId: string): Promise<void>;
  listSessionEpisodes(sessionId: string): Promise<SessionEpisodeListItem[]>;
  listWorkspaceSparks(
    workspaceId: string,
    options?: ListWorkspaceSparksOptions,
  ): Promise<WorkspaceSparkSummary[]>;
  listWorkspaceEpisodes(
    workspaceId: string,
    options?: ListWorkspaceEpisodesOptions,
  ): Promise<WorkspaceEpisodeSummary[]>;
  listWorkspaceStorage(
    workspaceId: string,
    role: MountRole,
    options?: ListWorkspaceStorageOptions,
  ): Promise<WorkspaceStorageListing>;
  listWorkpieceStorage(
    workpieceId: string,
    options?: ListWorkpieceStorageOptions,
  ): Promise<WorkpieceStorageListing>;
  listWorkspaceCanonicalRecordings(
    workspaceId: string,
    options?: ListWorkspaceCanonicalRecordingsOptions,
  ): Promise<WorkspaceCanonicalRecordingListing>;
  archiveWorkpiece(
    workpieceId: string,
    input: ArchiveWorkpieceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkspaceEpisodeSummary>;
  restoreWorkpiece(
    workpieceId: string,
    input: RestoreWorkpieceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkspaceEpisodeSummary>;
  listWorkspaceReadyScripts(
    workspaceId: string,
    options?: ListWorkspaceReadyScriptsOptions,
  ): Promise<WorkspaceReadyScript[]>;
  updateWorkspaceReadyQueueState(
    workspaceId: string,
    input: UpdateWorkspaceReadyQueueStateRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<UpdateWorkspaceReadyQueueStateResult>;
  getWorkpieceImageMap(
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceImageMapResponseData>;
  getWorkpieceVisualPackage(
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceVisualPackageResponseData>;
  generateImageMapCandidates(
    workpieceId: string,
    input: GenerateImageMapCandidatesRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<GenerateImageMapCandidatesResponse>;
  saveWorkpieceImageMap(
    workpieceId: string,
    input: SaveWorkpieceImageMapRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceImageMapResponseData>;
  getWorkpieceRecordingTruth(workpieceId: string): Promise<WorkpieceRecordingTruth>;
  appendEvent(workpieceId: string, input: AppendEventRequest): Promise<WorkpieceEventRow>;
  readWorkpieceJson(workpieceId: string, path: string): Promise<ReadJsonFileResult>;
  readWorkspaceJson(workspaceId: string, path: string): Promise<ReadJsonFileResult>;
  readWorkpieceText(workpieceId: string, path: string): Promise<ReadTextFileResult>;
  readWorkspaceText(workspaceId: string, path: string): Promise<ReadTextFileResult>;
  readWorkpieceBinary(workpieceId: string, path: string): Promise<ReadBinaryFileResult>;
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function jsonResponse(status: number, body: unknown, requestId?: string): Response {
  const headers: Record<string, string> = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (requestId) {
    headers["x-request-id"] = requestId;
  }

  return new Response(JSON.stringify(body), {
    status,
    headers,
  });
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorResponse(error: unknown, requestId?: string): Response {
  if (error instanceof HttpError) {
    return jsonResponse(error.status, {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(typeof error.details === "undefined" ? {} : { details: error.details }),
        ...(requestId ? { request_id: requestId } : {}),
      },
    }, requestId);
  }

  const message = error instanceof Error ? error.message : "Unexpected error";
  return jsonResponse(500, {
    ok: false,
    error: {
      code: "internal_error",
      message,
      ...(requestId ? { request_id: requestId } : {}),
    },
  }, requestId);
}

async function parseJsonBody(request: Request): Promise<Record<string, unknown>> {
  let text = "";
  try {
    text = await request.text();
  } catch (error) {
    throw new HttpError(400, "invalid_body", "Unable to read request body", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!isRecord(parsed)) {
      throw new HttpError(400, "invalid_body", "Request body must be a JSON object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON", {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeWorkspaceRole(input: unknown): WorkspaceRole | null {
  if (typeof input !== "string") return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === "member") return "editor";
  if (normalized === "viewer" || normalized === "editor" || normalized === "admin" || normalized === "owner") {
    return normalized;
  }
  return null;
}

function workspaceRoleAtLeast(currentRole: WorkspaceRole, minRole: WorkspaceRole): boolean {
  return WORKSPACE_ROLE_RANK[currentRole] >= WORKSPACE_ROLE_RANK[minRole];
}

function normalizeUuid(input: unknown, field: string): string {
  if (typeof input !== "string" || !UUID_RE.test(input)) {
    throw new HttpError(400, "invalid_uuid", `Invalid ${field}`);
  }
  return input;
}

function normalizeNonEmptyString(input: unknown, field: string): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_string", `${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "invalid_string", `${field} must not be empty`);
  }
  return trimmed;
}

function normalizeContentType(input: unknown, path: string): string {
  if (typeof input === "string" && input.trim()) return input.trim();
  const ext = extensionOf(path);
  if (ext === ".json") return "application/json";
  if (ext === ".jsonl") return "application/x-ndjson";
  if (ext === ".md") return "text/markdown; charset=utf-8";
  if (ext === ".txt" || ext === ".vtt") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function normalizeRelativePath(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_path", "path must be a string");
  }

  const trimmed = input.trim();
  if (!trimmed) throw new HttpError(400, "invalid_path", "path must not be empty");
  if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) {
    throw new HttpError(400, "invalid_path", "path must be relative to workpiece root");
  }
  if (trimmed.includes("\\")) {
    throw new HttpError(400, "invalid_path", "path must use forward slashes");
  }

  const segments = trimmed.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") {
      throw new HttpError(400, "invalid_path", "path contains invalid segments");
    }
  }

  return segments.join("/");
}

function normalizeOptionalRelativePath(input: unknown): string | null {
  if (input == null) return null;
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_path", "path must be a string");
  }
  const trimmed = input.trim();
  if (!trimmed) return null;
  return normalizeRelativePath(trimmed);
}

const MOUNT_ROLE_SET = new Set<MountRole>(ALL_MOUNT_ROLES);

function normalizeMountRole(input: unknown, field = "role"): MountRole {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_mount_role", `${field} must be a string`);
  }
  const trimmed = input.trim();
  if (!MOUNT_ROLE_SET.has(trimmed as MountRole)) {
    throw new HttpError(400, "invalid_mount_role", `${field} must be one of ${ALL_MOUNT_ROLES.join(", ")}`);
  }
  return trimmed as MountRole;
}

function normalizeStorageListDepth(input: unknown): number {
  if (input == null || input === "") return STORAGE_LIST_MAX_DEPTH;
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_depth", "depth must be a string query parameter");
  }

  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value) || String(value) !== input.trim()) {
    throw new HttpError(400, "invalid_depth", "depth must be an integer");
  }
  if (value < 0 || value > STORAGE_LIST_MAX_DEPTH) {
    throw new HttpError(400, "invalid_depth", `depth must be between 0 and ${STORAGE_LIST_MAX_DEPTH}`);
  }
  return value;
}

function joinRelativePath(basePath: string, childName: string): string {
  if (!basePath) return childName;
  return `${basePath}/${childName}`;
}

function compareWorkspaceStorageNodes(left: WorkspaceStorageTreeNode, right: WorkspaceStorageTreeNode): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function compareIsoTimestampDescending(left: string | null | undefined, right: string | null | undefined): number {
  const leftTs = left ? Date.parse(left) : Number.NaN;
  const rightTs = right ? Date.parse(right) : Number.NaN;
  const leftOk = Number.isFinite(leftTs);
  const rightOk = Number.isFinite(rightTs);
  if (leftOk && rightOk) {
    if (leftTs === rightTs) return 0;
    return leftTs > rightTs ? -1 : 1;
  }
  if (leftOk) return -1;
  if (rightOk) return 1;
  return 0;
}

function inferWorkspaceStorageNodeKind(entry: Record<string, unknown>): "directory" | "file" {
  if (typeof entry.id === "string" && entry.id.trim()) return "file";
  const metadata = entry.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const size = (metadata as Record<string, unknown>).size;
    if (typeof size === "number" && Number.isFinite(size)) return "file";
  }
  return "directory";
}

function readWorkspaceStorageBytes(entry: Record<string, unknown>): number | null | undefined {
  const metadata = entry.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const size = (metadata as Record<string, unknown>).size;
  return typeof size === "number" && Number.isFinite(size) ? size : undefined;
}

function extensionOf(path: string): string {
  const idx = path.lastIndexOf(".");
  if (idx <= 0 || idx === path.length - 1) return "";
  return path.slice(idx).toLowerCase();
}

function isJsonFile(path: string, contentType: string): boolean {
  const ext = extensionOf(path);
  if (ext === ".json") return true;
  return contentType.toLowerCase().includes("application/json");
}

function isJsonlFile(path: string, contentType: string): boolean {
  const ext = extensionOf(path);
  if (ext === ".jsonl") return true;
  const ct = contentType.toLowerCase();
  return ct.includes("jsonl") || ct.includes("ndjson");
}

function isLfTextFile(path: string): boolean {
  const ext = extensionOf(path);
  return ext === ".md" || ext === ".txt" || ext === ".vtt";
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function normalizeLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function normalizeWrittenBy(input: unknown): WrittenBy {
  if (!isRecord(input)) {
    throw new HttpError(400, "invalid_written_by", "written_by is required");
  }

  return {
    tool: normalizeNonEmptyString(input.tool, "written_by.tool"),
    tool_version: normalizeNonEmptyString(input.tool_version, "written_by.tool_version"),
    lane: normalizeNonEmptyString(input.lane, "written_by.lane"),
  };
}

function normalizeJsonValue(input: unknown): JsonValue {
  if (input === null) return null;
  if (typeof input === "string" || typeof input === "boolean") return input;
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new HttpError(400, "invalid_json", "JSON numbers must be finite");
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => normalizeJsonValue(item));
  }
  if (isRecord(input)) {
    const out: JsonObject = {};
    for (const key of Object.keys(input).sort()) {
      const value = input[key];
      if (typeof value === "undefined") continue;
      out[key] = normalizeJsonValue(value);
    }
    return out;
  }

  throw new HttpError(400, "invalid_json", "JSON payload contains unsupported values");
}

function canonicalJsonBytes(input: unknown): Uint8Array {
  const normalized = normalizeJsonValue(input);
  return textEncoder.encode(JSON.stringify(normalized));
}

function parseJsonText(text: string, field: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new HttpError(400, "invalid_json", `${field} must contain valid JSON`, {
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

function decodeBase64(base64: string): Uint8Array {
  const value = base64.trim();
  if (!value) throw new HttpError(400, "invalid_base64", "base64 payload must not be empty");

  if (typeof atob === "function") {
    try {
      const binary = atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      throw new HttpError(400, "invalid_base64", "Invalid base64 payload", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: {
      from(data: string, encoding: "base64"): Uint8Array;
    };
  };

  if (globalWithBuffer.Buffer?.from) {
    try {
      return new Uint8Array(globalWithBuffer.Buffer.from(value, "base64"));
    } catch (error) {
      throw new HttpError(400, "invalid_base64", "Invalid base64 payload", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  throw new HttpError(500, "base64_unavailable", "No base64 decoder available in runtime");
}

function encodeBase64(bytes: Uint8Array): string {
  const globalWithBuffer = globalThis as typeof globalThis & {
    Buffer?: {
      from(data: Uint8Array): { toString(encoding: "base64"): string };
    };
  };

  if (globalWithBuffer.Buffer?.from) {
    return globalWithBuffer.Buffer.from(bytes).toString("base64");
  }

  if (typeof btoa === "function") {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  }

  throw new HttpError(500, "base64_unavailable", "No base64 encoder available in runtime");
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new HttpError(500, "crypto_unavailable", "crypto.subtle is unavailable in this runtime");
  }

  const digest = await subtle.digest("SHA-256", uint8ToArrayBuffer(bytes));
  const out = new Uint8Array(digest);
  let hex = "";
  for (const n of out) {
    hex += n.toString(16).padStart(2, "0");
  }
  return hex;
}

function buildStorageKey(workpieceId: string, path: string): string {
  return `workpieces/${workpieceId}/${path}`;
}

function buildManifestFileEntry(
  type: string,
  contentType: string,
  bytes: number,
  hash: string,
  writtenBy: WrittenBy,
  updatedAt: string,
): ManifestFileEntry {
  return {
    type,
    content_type: contentType,
    bytes,
    hash: {
      algo: SHA256_ALGO,
      value: hash,
    },
    written_by: writtenBy,
    updated_at: updatedAt,
  };
}

function inferFileType(path: string, contentType: string): string {
  if (path === "metadata.json") return "metadata";
  if (path === MANIFEST_PATH) return "manifest";
  if (path === "assets/assets.json") return "assets_registry";
  if (path === "script/script.md") return "script";
  if (path === "script/script.format.json") return "script_format";
  if (path === "script/script.sources.json") return "script_sources";

  if (path.startsWith("script/") && extensionOf(path) === ".md") return "script";
  if (path.startsWith("assets/") && extensionOf(path) === ".json") return "asset";
  if (path.startsWith("events/") && extensionOf(path) === ".jsonl") return "events";
  if (isJsonFile(path, contentType)) return "json";
  if (isLfTextFile(path)) return "text";
  return "artifact";
}

function inferPointerKey(path: string): ManifestPointerKey | null {
  if (path === "script/script.md") return "script_primary";
  if (path === "script/script.format.json") return "script_format";
  if (path === "script/script.sources.json") return "script_sources";
  if (path === "assets/assets.json") return "assets_registry";
  if (path.startsWith("session/")) return "session_current";
  if (path.startsWith("edit/")) return "edit_current";
  if (path.startsWith("export/")) return "export_current";
  if (path.startsWith("publish/")) return "publish_intent";
  return null;
}

function applyPointerUpdates(manifest: WorkpieceManifest, path: string, pointer?: ManifestPointerKey): void {
  if (pointer) {
    manifest.pointers[pointer] = path;
  }

  const inferred = inferPointerKey(path);
  if (inferred) {
    manifest.pointers[inferred] = path;
  }

  const pointerKeys = Object.keys(manifest.pointers) as ManifestPointerKey[];
  for (const key of pointerKeys) {
    if (manifest.pointers[key] === path) {
      manifest.pointers[key] = path;
    }
  }
}

function normalizeCorrelationId(input: unknown): string | null {
  if (typeof input === "undefined" || input === null) return null;
  return normalizeNonEmptyString(input, "correlation_id");
}

function normalizePointerKey(input: unknown): ManifestPointerKey | undefined {
  if (typeof input === "undefined") return undefined;
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_pointer", "pointer must be a string");
  }
  const trimmed = input.trim();
  if (!trimmed) {
    throw new HttpError(400, "invalid_pointer", "pointer must not be empty");
  }
  if (!MANIFEST_POINTER_KEY_SET.has(trimmed as ManifestPointerKey)) {
    throw new HttpError(400, "invalid_pointer", `Unsupported pointer key: ${trimmed}`);
  }
  return trimmed as ManifestPointerKey;
}

function asJson(input: unknown): Json {
  return normalizeJsonValue(input) as Json;
}

function defaultManifest(workpieceId: string, workspaceId: string, status: string, nowIso: string): WorkpieceManifest {
  return {
    schema: "forge.manifest.v1",
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    status,
    pointers: {
      script_primary: null,
      script_format: null,
      script_sources: null,
      assets_registry: "assets/assets.json",
      session_current: null,
      edit_current: null,
      export_current: null,
      publish_intent: null,
    },
    hashing: {
      algo: "sha256",
      text_newlines: "LF",
      json: {
        sorted_keys: true,
        minified: true,
        preserve_array_order: true,
      },
    },
    origin: {
      created_by: {
        user_id: null,
        display_name: null,
      },
      tool: {
        name: DEFAULT_ORIGIN_TOOL.name,
        version: DEFAULT_ORIGIN_TOOL.version,
      },
    },
    files: {},
  };
}

function normalizeLoadedManifest(
  parsed: unknown,
  fallback: {
    workpieceId: string;
    workspaceId: string;
    status: string;
    createdAt: string;
  },
): WorkpieceManifest {
  if (!isRecord(parsed)) {
    throw new HttpError(500, "manifest_invalid", "manifest.json is not a JSON object");
  }

  const base = defaultManifest(fallback.workpieceId, fallback.workspaceId, fallback.status, fallback.createdAt);

  const schema = parsed.schema === "forge.manifest.v1" ? "forge.manifest.v1" : base.schema;
  const workpieceId = typeof parsed.workpiece_id === "string" ? parsed.workpiece_id : base.workpiece_id;
  const workspaceId = typeof parsed.workspace_id === "string" ? parsed.workspace_id : base.workspace_id;
  const createdAt = typeof parsed.created_at === "string" ? parsed.created_at : base.created_at;
  const updatedAt = typeof parsed.updated_at === "string" ? parsed.updated_at : base.updated_at;
  const status = typeof parsed.status === "string" && parsed.status.trim() ? parsed.status : base.status;

  const pointers = { ...base.pointers };
  if (isRecord(parsed.pointers)) {
    const keys = Object.keys(pointers) as ManifestPointerKey[];
    for (const key of keys) {
      const value = parsed.pointers[key];
      pointers[key] = typeof value === "string" ? value : null;
    }
  }

  const files: Record<string, ManifestFileEntry> = {};
  if (isRecord(parsed.files)) {
    for (const [path, entry] of Object.entries(parsed.files)) {
      if (!isRecord(entry)) continue;
      const hash = isRecord(entry.hash) ? entry.hash : null;
      const writtenByRaw = isRecord(entry.written_by) ? entry.written_by : null;
      if (!hash || !writtenByRaw) continue;
      if (
        typeof hash.algo !== "string" ||
        typeof hash.value !== "string" ||
        typeof entry.type !== "string" ||
        typeof entry.content_type !== "string" ||
        typeof entry.bytes !== "number" ||
        typeof entry.updated_at !== "string"
      ) {
        continue;
      }
      if (
        typeof writtenByRaw.tool !== "string" ||
        typeof writtenByRaw.tool_version !== "string" ||
        typeof writtenByRaw.lane !== "string"
      ) {
        continue;
      }

      files[path] = {
        type: entry.type,
        content_type: entry.content_type,
        bytes: entry.bytes,
        hash: {
          algo: "sha256",
          value: hash.value,
        },
        written_by: {
          tool: writtenByRaw.tool,
          tool_version: writtenByRaw.tool_version,
          lane: writtenByRaw.lane,
        },
        updated_at: entry.updated_at,
      };
    }
  }

  const normalized: WorkpieceManifest = {
    ...base,
    schema,
    workpiece_id: workpieceId,
    workspace_id: workspaceId,
    created_at: createdAt,
    updated_at: updatedAt,
    status,
    pointers,
    files,
  };

  if (isRecord(parsed.origin)) {
    const originRaw = parsed.origin;
    const createdByRaw = isRecord(originRaw.created_by) ? originRaw.created_by : null;
    const toolRaw = isRecord(originRaw.tool) ? originRaw.tool : null;
    normalized.origin = {
      created_by: {
        user_id: createdByRaw && typeof createdByRaw.user_id === "string" ? createdByRaw.user_id : null,
        display_name:
          createdByRaw && typeof createdByRaw.display_name === "string" ? createdByRaw.display_name : null,
      },
      tool: {
        name: toolRaw && typeof toolRaw.name === "string" ? toolRaw.name : DEFAULT_ORIGIN_TOOL.name,
        version: toolRaw && typeof toolRaw.version === "string" ? toolRaw.version : DEFAULT_ORIGIN_TOOL.version,
      },
    };
  }

  return normalized;
}

async function finalizeManifestTwoPass(
  manifest: WorkpieceManifest,
  manifestWrittenBy: WrittenBy,
  nowIso: string,
): Promise<{
  manifestDocument: WorkpieceManifest;
  manifestBytes: Uint8Array;
  pass1Hash: string;
  pass1Bytes: number;
  finalHash: string;
  finalBytes: number;
}> {
  const pass1Manifest: WorkpieceManifest = {
    ...manifest,
    updated_at: nowIso,
    files: { ...manifest.files },
  };
  delete pass1Manifest.files[MANIFEST_PATH];

  const pass1Bytes = canonicalJsonBytes(pass1Manifest);
  const pass1Hash = await sha256Hex(pass1Bytes);

  const pass2Manifest: WorkpieceManifest = {
    ...pass1Manifest,
    files: {
      ...pass1Manifest.files,
      [MANIFEST_PATH]: buildManifestFileEntry(
        "manifest",
        "application/json",
        pass1Bytes.length,
        pass1Hash,
        manifestWrittenBy,
        nowIso,
      ),
    },
  };

  const pass2Bytes = canonicalJsonBytes(pass2Manifest);
  const pass2Hash = await sha256Hex(pass2Bytes);

  return {
    manifestDocument: pass2Manifest,
    manifestBytes: pass2Bytes,
    pass1Hash,
    pass1Bytes: pass1Bytes.length,
    finalHash: pass2Hash,
    finalBytes: pass2Bytes.length,
  };
}

async function uploadStorageObject(
  supabase: SupabaseClient<Database>,
  bucket: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).upload(key, uint8ToArrayBuffer(bytes), {
    upsert: true,
    contentType,
  });

  if (error) {
    logStorageError("upload", bucket, key, error);
    if (isStorageObjectTooLargeError(error)) {
      throw new HttpError(413, "storage_object_too_large", "File exceeds the configured Storage object size limit", {
        bucket,
        key,
        reason: error.message,
      });
    }
    throw new HttpError(502, "storage_write_failed", "Unable to write file to Storage", {
      key,
      reason: error.message,
    });
  }
}

function isStorageObjectTooLargeError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : null;
  const statusCode =
    typeof record.statusCode === "string"
      ? record.statusCode.trim()
      : typeof record.statusCode === "number"
      ? String(record.statusCode)
      : null;
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  if (status === 413 || statusCode === "413") return true;
  return message.includes("maximum allowed size");
}

function shouldDebugStorage(): boolean {
  if (typeof globalThis === "undefined") return false;
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.TONGS_DEBUG_STORAGE === "1";
}

function safeSerializeError(error: unknown): unknown {
  if (!error || typeof error !== "object") return error;
  try {
    return JSON.parse(JSON.stringify(error));
  } catch {
    return { message: String(error) };
  }
}

function extractErrorDetails(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== "object") return null;
  const details: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    details[key] = (error as Record<string, unknown>)[key];
  }
  const proto = Object.getPrototypeOf(error);
  if (proto?.constructor?.name && proto.constructor.name !== "Object") {
    details.__type = proto.constructor.name;
  }
  return details;
}

async function extractResponseDetails(error: unknown): Promise<Record<string, unknown> | null> {
  const response = (error as { originalError?: unknown } | null | undefined)?.originalError;
  if (!response || typeof response !== "object") return null;
  const maybeResponse = response as Response;
  if (typeof maybeResponse.text !== "function") return null;

  try {
    const bodyText = await maybeResponse.clone().text();
    let bodyJson: unknown = null;
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      bodyJson = null;
    }
    return {
      status: maybeResponse.status,
      statusText: maybeResponse.statusText,
      bodyText,
      bodyJson,
      url: maybeResponse.url,
    };
  } catch {
    return {
      status: maybeResponse.status,
      statusText: maybeResponse.statusText,
      url: maybeResponse.url,
    };
  }
}

function logStorageError(action: "download" | "upload" | "delete", bucket: string, key: string, error: unknown): void {
  if (!shouldDebugStorage()) return;
  const serialized = safeSerializeError(error);
  const extracted = extractErrorDetails(error);
  const message = error instanceof Error ? error.message : undefined;
  console.log(`[tongs][storage:${action}] error keys`, Object.getOwnPropertyNames(error ?? {}));
  console.log(
    `[tongs][storage:${action}] original keys`,
    Object.getOwnPropertyNames((error as { originalError?: unknown } | null | undefined)?.originalError ?? {}),
  );
  console.dir(error, { depth: null });
  const original = (error as { originalError?: unknown } | null | undefined)?.originalError;
  if (original) {
    console.dir(original, { depth: null });
  }
  console.error(`[tongs][storage:${action}]`, {
    bucket,
    key,
    message,
    error: serialized,
    extracted,
  });
  console.error(`[tongs][storage:${action}] raw`, error);
}

function isBootstrapWorkpiecePath(path: string): boolean {
  return BOOTSTRAP_WORKPIECE_PATHS.has(path);
}

function isBootstrapWorkspacePath(path: string): boolean {
  return BOOTSTRAP_WORKSPACE_PATHS.has(path);
}

async function downloadStorageObject(
  supabase: SupabaseClient<Database>,
  bucket: string,
  key: string,
): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error) {
    const message = String(error.message || "").toLowerCase();
    const statusCode = (error as { statusCode?: unknown; status?: unknown }).statusCode
      ?? (error as { status?: unknown }).status
      ?? null;
    const code = String(statusCode ?? "");
    if (message.includes("not found") || code === "404") return null;

    const responseDetails = await extractResponseDetails(error);
    if (responseDetails) {
      const status = Number(responseDetails.status ?? NaN);
      const bodyJson = responseDetails.bodyJson as { statusCode?: unknown; error?: unknown; message?: unknown } | null;
      const bodyText = String(responseDetails.bodyText ?? "");
      const statusCodeText = bodyJson?.statusCode ?? "";
      const statusCodeNum = typeof statusCodeText === "string" ? Number(statusCodeText) : Number(statusCodeText ?? NaN);
      const isNotFound = status === 404
        || (status === 400 && (
          statusCodeNum === 404
          || bodyJson?.error === "not_found"
          || /object not found/i.test(String(bodyJson?.message ?? bodyText))
        ));

      if (isNotFound) return null;
    }

    logStorageError("download", bucket, key, error);
    if (responseDetails && shouldDebugStorage()) {
      console.error("[tongs][storage:download] response", responseDetails);
    }
    throw new HttpError(502, "storage_read_failed", "Unable to read file from Storage", {
      key,
      reason: error.message,
      status: statusCode,
      response: responseDetails ?? undefined,
    });
  }

  if (!data) return null;
  const ab = await data.arrayBuffer();
  return new Uint8Array(ab);
}

async function downloadStorageObjectFromCandidates(
  supabase: SupabaseClient<Database>,
  bucket: string,
  keys: readonly string[],
): Promise<Uint8Array | null> {
  for (const key of keys) {
    const bytes = await downloadStorageObject(supabase, bucket, key);
    if (bytes) return bytes;
  }
  return null;
}

function canonicalizeJsonlLine(input: unknown): Uint8Array {
  const value = typeof input === "string" ? parseJsonText(input, "jsonl_append") : input;
  const lineBody = canonicalJsonBytes(value);
  const newline = textEncoder.encode("\n");
  return concatBytes([lineBody, newline]);
}

function canonicalizeReplaceBytes(path: string, contentType: string, body: CommitFileRequest): Uint8Array {
  const content = typeof body.content === "undefined" ? undefined : body.content;
  const jsonValue = typeof body.json === "undefined" ? undefined : body.json;
  const textValue = typeof body.text === "undefined" ? undefined : body.text;
  const base64Value =
    typeof body.bytes_base64 === "string"
      ? body.bytes_base64
      : typeof body.content_base64 === "string"
        ? body.content_base64
        : undefined;

  if (isJsonFile(path, contentType)) {
    if (typeof jsonValue !== "undefined") return canonicalJsonBytes(jsonValue);
    if (typeof content !== "undefined" && typeof content !== "string") return canonicalJsonBytes(content);

    let jsonText = "";
    if (typeof textValue === "string") jsonText = textValue;
    else if (typeof content === "string") jsonText = content;
    else if (typeof base64Value === "string") jsonText = textDecoder.decode(decodeBase64(base64Value));

    if (!jsonText) {
      throw new HttpError(
        400,
        "missing_content",
        "JSON commit requires json, content, text, bytes_base64, or content_base64",
      );
    }

    const parsed = parseJsonText(stripBom(jsonText), "JSON content");
    return canonicalJsonBytes(parsed);
  }

  if (typeof textValue === "string" || typeof content === "string") {
    let text = typeof textValue === "string" ? textValue : (content as string);
    if (isLfTextFile(path)) {
      text = normalizeLf(stripBom(text));
    }
    return textEncoder.encode(text);
  }

  if (typeof jsonValue !== "undefined") {
    return canonicalJsonBytes(jsonValue);
  }
  if (typeof content !== "undefined") {
    if (typeof content === "string") {
      let text = content;
      if (isLfTextFile(path)) {
        text = normalizeLf(stripBom(text));
      }
      return textEncoder.encode(text);
    }
    return canonicalJsonBytes(content);
  }

  if (typeof base64Value === "string") {
    const bytes = decodeBase64(base64Value);
    if (isLfTextFile(path)) {
      const text = normalizeLf(stripBom(textDecoder.decode(bytes)));
      return textEncoder.encode(text);
    }
    return bytes;
  }

  throw new HttpError(400, "missing_content", "Commit payload must include text/json/content/bytes_base64");
}

function normalizeCommitFileRequest(
  body: Record<string, unknown>,
  userAccessTokenFromHeader?: string | null,
): CommitFileRequest {
  return {
    path: normalizeRelativePath(body.path),
    content_type: typeof body.content_type === "string" ? body.content_type : undefined,
    file_type: typeof body.file_type === "string" ? body.file_type : undefined,
    written_by: normalizeWrittenBy(body.written_by),
    pointer: normalizePointerKey(body.pointer),
    event_name: typeof body.event_name === "string" ? body.event_name : undefined,
    event_payload: typeof body.event_payload === "undefined" ? undefined : (asJson(body.event_payload) as Json),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
    text: typeof body.text === "string" ? body.text : undefined,
    json: typeof body.json === "undefined" ? undefined : body.json,
    content: typeof body.content === "undefined" ? undefined : body.content,
    bytes_base64: typeof body.bytes_base64 === "string" ? body.bytes_base64 : undefined,
    content_base64: typeof body.content_base64 === "string" ? body.content_base64 : undefined,
    jsonl_append: typeof body.jsonl_append === "undefined" ? undefined : body.jsonl_append,
    expected_previous_updated_at: typeof body.expected_previous_updated_at === "string"
      ? normalizeIsoTimestamp(body.expected_previous_updated_at, "expected_previous_updated_at")
      : undefined,
    user_access_token: userAccessTokenFromHeader
      ?? (typeof body.user_access_token === "string"
        ? normalizeNonEmptyString(body.user_access_token, "user_access_token")
        : undefined),
  };
}

function normalizeCreateCradleRequest(body: Record<string, unknown>): CreateCradleRequest {
  let createdBy: CreateCradleRequest["created_by"];
  if (isRecord(body.created_by)) {
    createdBy = {
      user_id: typeof body.created_by.user_id === "string" ? body.created_by.user_id : null,
      display_name: typeof body.created_by.display_name === "string" ? body.created_by.display_name : null,
    };
  }

  let originTool: CreateCradleRequest["origin_tool"];
  if (isRecord(body.origin_tool)) {
    originTool = {
      name: normalizeNonEmptyString(body.origin_tool.name, "origin_tool.name"),
      version: normalizeNonEmptyString(body.origin_tool.version, "origin_tool.version"),
    };
  }

  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    cradle_id: typeof body.cradle_id === "string" ? normalizeUuid(body.cradle_id, "cradle_id") : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    metadata: typeof body.metadata === "undefined" ? undefined : (asJson(body.metadata) as Json),
    created_by: createdBy,
    origin_tool: originTool,
    written_by: typeof body.written_by === "undefined" ? undefined : normalizeWrittenBy(body.written_by),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
  };
}

function normalizeAppendEventRequest(body: Record<string, unknown>): AppendEventRequest {
  return {
    event_name: normalizeNonEmptyString(body.event_name, "event_name"),
    payload: typeof body.payload === "undefined" ? undefined : (asJson(body.payload) as Json),
    correlation_id: typeof body.correlation_id === "string" ? body.correlation_id : undefined,
    written_by: normalizeWrittenBy(body.written_by),
  };
}

function normalizeIsoTimestamp(input: unknown, field: string): string {
  if (typeof input !== "string" || !input.trim()) {
    throw new HttpError(400, "invalid_timestamp", `${field} must be a non-empty ISO timestamp string`);
  }
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) {
    throw new HttpError(400, "invalid_timestamp", `${field} must be a valid timestamp`);
  }
  return date.toISOString();
}

function normalizeComparableIsoTimestampOrNull(input: unknown): string | null {
  if (typeof input !== "string" || !input.trim()) {
    return null;
  }
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) {
    return input.trim();
  }
  return date.toISOString();
}

function normalizeOptionalIsoTimestampOrNull(input: unknown, field: string): string | null | undefined {
  if (typeof input === "undefined") return undefined;
  if (input === null) return null;
  return normalizeIsoTimestamp(input, field);
}

function normalizeOptionalUuidOrNull(input: unknown, field: string): string | null | undefined {
  if (typeof input === "undefined") return undefined;
  if (input === null) return null;
  return normalizeUuid(input, field);
}

function normalizeRecordingSessionStatus(input: unknown, field: string): RecordingSessionStatus {
  if (typeof input !== "string") {
    throw new HttpError(400, "invalid_status", `${field} must be one of: ${RECORDING_SESSION_STATUS_VALUES.join(", ")}`);
  }
  const normalized = input.trim().toLowerCase();
  if (!RECORDING_SESSION_STATUS_SET.has(normalized)) {
    throw new HttpError(400, "invalid_status", `${field} must be one of: ${RECORDING_SESSION_STATUS_VALUES.join(", ")}`);
  }
  return normalized as RecordingSessionStatus;
}

function normalizeNonNegativeInteger(input: unknown, field: string): number {
  if (typeof input !== "number" || !Number.isInteger(input) || input < 0) {
    throw new HttpError(400, "invalid_integer", `${field} must be a non-negative integer`);
  }
  return input;
}

function normalizeCreateRecordingSessionRequest(body: Record<string, unknown>): CreateRecordingSessionRequest {
  return {
    title: normalizeNonEmptyString(body.title, "title"),
    starts_at: normalizeIsoTimestamp(body.starts_at, "starts_at"),
    ends_at: normalizeOptionalIsoTimestampOrNull(body.ends_at, "ends_at"),
    calendar_event_id: normalizeOptionalUuidOrNull(body.calendar_event_id, "calendar_event_id"),
  };
}

function normalizeCreateRecordingSessionRecordRequest(body: Record<string, unknown>): CreateRecordingSessionRecordRequest {
  let title: string | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    if (typeof body.title !== "string") {
      throw new HttpError(400, "invalid_string", "title must be a string");
    }
    const trimmed = body.title.trim();
    if (trimmed) {
      title = trimmed;
    }
  }

  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    ...(title ? { title } : {}),
    calendar_event_id: normalizeOptionalUuidOrNull(body.calendar_event_id, "calendar_event_id"),
  };
}

function normalizeUpdateRecordingSessionRequest(body: Record<string, unknown>): UpdateRecordingSessionRequest {
  const patch: UpdateRecordingSessionRequest = {};

  if (Object.prototype.hasOwnProperty.call(body, "title")) {
    patch.title = normalizeNonEmptyString(body.title, "title");
  }
  if (Object.prototype.hasOwnProperty.call(body, "starts_at")) {
    patch.starts_at = normalizeIsoTimestamp(body.starts_at, "starts_at");
  }
  if (Object.prototype.hasOwnProperty.call(body, "ends_at")) {
    patch.ends_at = normalizeOptionalIsoTimestampOrNull(body.ends_at, "ends_at");
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    patch.status = normalizeRecordingSessionStatus(body.status, "status");
  }

  if (Object.keys(patch).length === 0) {
    throw new HttpError(400, "invalid_patch", "At least one updatable field is required");
  }

  return patch;
}

function normalizeRecordingSessionListRange(searchParams: URLSearchParams): RecordingSessionListRange {
  const range: RecordingSessionListRange = {};

  const startsAt = searchParams.get("starts_at");
  if (startsAt && startsAt.trim()) {
    range.starts_at = normalizeIsoTimestamp(startsAt, "starts_at");
  }

  const endsAt = searchParams.get("ends_at");
  if (endsAt && endsAt.trim()) {
    range.ends_at = normalizeIsoTimestamp(endsAt, "ends_at");
  }

  const limitRaw = searchParams.get("limit");
  if (limitRaw && limitRaw.trim()) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) {
      throw new HttpError(400, "invalid_limit", "limit must be an integer between 1 and 500");
    }
    range.limit = parsed;
  }

  return range;
}

function normalizeRecordingSessionListOptions(searchParams: URLSearchParams): RecordingSessionListOptions {
  const options: RecordingSessionListOptions = {};

  const workspaceId = searchParams.get("workspace_id");
  if (workspaceId && workspaceId.trim()) {
    options.workspace_id = normalizeUuid(workspaceId.trim(), "workspace_id");
  }

  const limitRaw = searchParams.get("limit");
  if (limitRaw && limitRaw.trim()) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 500) {
      throw new HttpError(400, "invalid_limit", "limit must be an integer between 1 and 500");
    }
    options.limit = parsed;
  }

  return options;
}

function normalizeReplaceRecordingSessionItemsRequest(body: Record<string, unknown>): ReplaceRecordingSessionItemsRequest {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    throw new HttpError(400, "invalid_items", "items must be an array");
  }

  const items = rawItems.map((rawItem, index) => {
    if (!isRecord(rawItem)) {
      throw new HttpError(400, "invalid_items", `items[${index}] must be an object`);
    }
    return {
      episode_id: normalizeUuid(rawItem.episode_id, `items[${index}].episode_id`),
      script_path: normalizeRelativePath(rawItem.script_path),
    };
  });

  const seenEpisodeIds = new Set<string>();
  for (const item of items) {
    if (seenEpisodeIds.has(item.episode_id)) {
      throw new HttpError(400, "duplicate_episode", "items must not contain duplicate episode_id values");
    }
    seenEpisodeIds.add(item.episode_id);
  }

  return { items };
}

function normalizeAttachEpisodeToSessionRequest(body: Record<string, unknown>): AttachEpisodeToSessionRequest {
  let notes: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "notes")) {
    const raw = body.notes;
    if (raw === null) {
      notes = null;
    } else if (typeof raw === "string") {
      notes = raw;
    } else {
      throw new HttpError(400, "invalid_string", "notes must be a string or null");
    }
  }

  const position = Object.prototype.hasOwnProperty.call(body, "position")
    ? normalizeNonNegativeInteger(body.position, "position")
    : undefined;

  return {
    episode_id: normalizeUuid(body.episode_id, "episode_id"),
    ...(typeof position === "undefined" ? {} : { position }),
    ...(typeof notes === "undefined" ? {} : { notes }),
  };
}

function normalizeAttachCalendarEventAssignmentRequest(
  body: Record<string, unknown>,
): AttachCalendarEventAssignmentRequest {
  const rawAssignmentId = body.assignment_id ?? body.episode_id;
  return {
    assignment_id: normalizeUuid(rawAssignmentId, "assignment_id"),
  };
}

function normalizeHearthPresenceMode(value: unknown): HearthPresenceMode {
  const mode = normalizeNonEmptyString(value, "mode").toLowerCase();
  if (mode === "viewing" || mode === "editing") {
    return mode;
  }
  throw new HttpError(400, "invalid_mode", "mode must be viewing or editing");
}

function normalizeOptionalDisplayName(value: unknown): string | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  const next = normalizeNonEmptyString(value, "display_name");
  return next.slice(0, 120);
}

function normalizeUpsertHearthWorkpiecePresenceRequest(
  body: Record<string, unknown>,
): UpsertHearthWorkpiecePresenceRequest {
  const displayName = normalizeOptionalDisplayName(body.display_name);
  return {
    mode: normalizeHearthPresenceMode(body.mode),
    ...(typeof displayName === "undefined" ? {} : { display_name: displayName }),
  };
}

function normalizeHammerPresenceMode(value: unknown): HammerPresenceMode {
  const mode = normalizeNonEmptyString(value, "mode").toLowerCase();
  if (mode === "viewing" || mode === "editing") {
    return mode;
  }
  throw new HttpError(400, "invalid_mode", "mode must be viewing or editing");
}

function normalizeOptionalSessionId(value: unknown): string | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null) return null;
  return normalizeNonEmptyString(value, "session_id").slice(0, 160);
}

function normalizeUpsertHammerWorkpiecePresenceRequest(
  body: Record<string, unknown>,
): UpsertHammerWorkpiecePresenceRequest {
  const displayName = normalizeOptionalDisplayName(body.display_name);
  const sessionId = normalizeOptionalSessionId(body.session_id);
  return {
    mode: normalizeHammerPresenceMode(body.mode),
    ...(typeof displayName === "undefined" ? {} : { display_name: displayName }),
    ...(typeof sessionId === "undefined" ? {} : { session_id: sessionId }),
  };
}

function normalizeHammerPrepStatus(value: unknown, field = "prep_status"): HammerPrepStatus {
  const status = normalizeNonEmptyString(value, field).toLowerCase();
  if (HAMMER_PREP_STATUS_SET.has(status)) {
    return status as HammerPrepStatus;
  }
  throw new HttpError(400, "invalid_status", `${field} must be one of ${HAMMER_PREP_STATUS_VALUES.join(", ")}`);
}

function normalizeHammerAlignmentStatus(value: unknown, field = "alignment_status"): HammerAlignmentStatus {
  const status = normalizeNonEmptyString(value, field).toLowerCase();
  if (HAMMER_ALIGNMENT_STATUS_SET.has(status)) {
    return status as HammerAlignmentStatus;
  }
  throw new HttpError(400, "invalid_status", `${field} must be one of ${HAMMER_ALIGNMENT_STATUS_VALUES.join(", ")}`);
}

function normalizeHammerArtifactWriteRequest(
  value: unknown,
  field: string,
): HammerArtifactWriteRequest | undefined {
  if (typeof value === "undefined") return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_payload", `${field} must be an object`);
  }

  const row = value as Record<string, unknown>;
  if (!Object.prototype.hasOwnProperty.call(row, "data")) {
    throw new HttpError(400, "invalid_payload", `${field}.data is required`);
  }

  const path = typeof row.path === "undefined"
    ? undefined
    : normalizeRelativePath(row.path);
  const expectedPreviousUpdatedAt = typeof row.expected_previous_updated_at === "undefined"
    ? undefined
    : row.expected_previous_updated_at === null
      ? null
      : normalizeIsoTimestamp(row.expected_previous_updated_at, `${field}.expected_previous_updated_at`);

  return {
    ...(path ? { path } : {}),
    ...(typeof expectedPreviousUpdatedAt === "undefined"
      ? {}
      : { expected_previous_updated_at: expectedPreviousUpdatedAt }),
    data: row.data,
  };
}

function normalizeSaveHammerWorkpieceStateRequest(
  body: Record<string, unknown>,
): SaveHammerWorkpieceStateRequest {
  const writtenBy = normalizeWrittenBy(body.written_by);
  const activeSessionId = normalizeOptionalSessionId(body.active_session_id);
  const lastOpenedAt = typeof body.last_opened_at === "undefined"
    ? undefined
    : normalizeIsoTimestamp(body.last_opened_at, "last_opened_at");
  const prepStatus = typeof body.prep_status === "undefined"
    ? undefined
    : normalizeHammerPrepStatus(body.prep_status);
  const alignmentStatus = typeof body.alignment_status === "undefined"
    ? undefined
    : normalizeHammerAlignmentStatus(body.alignment_status);
  const macroRecipeRef = typeof body.macro_recipe_ref === "undefined"
    ? undefined
    : body.macro_recipe_ref === null
      ? null
      : normalizeNonEmptyString(body.macro_recipe_ref, "macro_recipe_ref");
  const lastMacroRunRef = typeof body.last_macro_run_ref === "undefined"
    ? undefined
    : body.last_macro_run_ref === null
      ? null
      : normalizeNonEmptyString(body.last_macro_run_ref, "last_macro_run_ref");
  const editPlanSignature = typeof body.edit_plan_signature === "undefined"
    ? undefined
    : body.edit_plan_signature === null
      ? null
      : normalizeNonEmptyString(body.edit_plan_signature, "edit_plan_signature");

  return {
    written_by: writtenBy,
    ...(typeof activeSessionId === "undefined" ? {} : { active_session_id: activeSessionId }),
    ...(typeof lastOpenedAt === "undefined" ? {} : { last_opened_at: lastOpenedAt }),
    ...(typeof prepStatus === "undefined" ? {} : { prep_status: prepStatus }),
    ...(typeof alignmentStatus === "undefined" ? {} : { alignment_status: alignmentStatus }),
    ...(typeof macroRecipeRef === "undefined" ? {} : { macro_recipe_ref: macroRecipeRef }),
    ...(typeof lastMacroRunRef === "undefined" ? {} : { last_macro_run_ref: lastMacroRunRef }),
    ...(typeof editPlanSignature === "undefined" ? {} : { edit_plan_signature: editPlanSignature }),
    ...(typeof body.editor_session === "undefined"
      ? {}
      : { editor_session: normalizeHammerArtifactWriteRequest(body.editor_session, "editor_session") }),
    ...(typeof body.structured_transcript === "undefined"
      ? {}
      : { structured_transcript: normalizeHammerArtifactWriteRequest(body.structured_transcript, "structured_transcript") }),
    ...(typeof body.speaker_map === "undefined"
      ? {}
      : { speaker_map: normalizeHammerArtifactWriteRequest(body.speaker_map, "speaker_map") }),
    ...(typeof body.visual_placements === "undefined"
      ? {}
      : { visual_placements: normalizeHammerArtifactWriteRequest(body.visual_placements, "visual_placements") }),
    ...(typeof body.audio_polish === "undefined"
      ? {}
      : { audio_polish: normalizeHammerArtifactWriteRequest(body.audio_polish, "audio_polish") }),
    ...(typeof body.edit_plan === "undefined"
      ? {}
      : { edit_plan: normalizeHammerArtifactWriteRequest(body.edit_plan, "edit_plan") }),
  };
}

function normalizeOptionalBoolean(input: unknown, field: string): boolean | undefined {
  if (typeof input === "undefined") return undefined;
  if (typeof input !== "boolean") {
    throw new HttpError(400, "invalid_boolean", `${field} must be a boolean`);
  }
  return input;
}

function normalizeOptionalLane(input: unknown): "forge" | "byo" | undefined {
  if (typeof input === "undefined") return undefined;
  if (input === "forge" || input === "byo") return input;
  throw new HttpError(400, "invalid_lane", "lane must be forge or byo");
}

function normalizeGenerateEpisodeThumbnailRequest(
  body: Record<string, unknown>,
  workpieceId: string,
  userAccessTokenFromHeader: string | null,
): GenerateEpisodeThumbnailRequest {
  const workspaceId = normalizeUuid(body.workspace_id, "workspace_id");
  const episodeId = normalizeUuid(body.episode_id ?? workpieceId, "episode_id");
  if (episodeId !== workpieceId) {
    throw new HttpError(400, "episode_mismatch", "episode_id must match workpiece path id");
  }

  const conceptId = typeof body.concept_id === "string" ? normalizeNonEmptyString(body.concept_id, "concept_id") : undefined;
  const prompt = typeof body.prompt === "string" ? normalizeNonEmptyString(body.prompt, "prompt") : undefined;
  if (!conceptId && !prompt) {
    throw new HttpError(400, "missing_prompt", "concept_id or prompt is required");
  }

  return {
    workspace_id: workspaceId,
    episode_id: episodeId,
    concept_id: conceptId,
    prompt,
    preset: typeof body.preset === "undefined" ? undefined : (body.preset === null ? null : normalizeNonEmptyString(body.preset, "preset")),
    aspect: typeof body.aspect === "undefined" ? undefined : (body.aspect === null ? null : normalizeNonEmptyString(body.aspect, "aspect")),
    size: typeof body.size === "undefined" ? undefined : (body.size === null ? null : normalizeNonEmptyString(body.size, "size")),
    lane: normalizeOptionalLane(body.lane),
    confirm_spend: normalizeOptionalBoolean(body.confirm_spend, "confirm_spend"),
    always_approve_ai_spend: normalizeOptionalBoolean(body.always_approve_ai_spend, "always_approve_ai_spend"),
    user_access_token: userAccessTokenFromHeader ?? (typeof body.user_access_token === "string" ? normalizeNonEmptyString(body.user_access_token, "user_access_token") : undefined),
  };
}

function normalizeOptionalReadyQueueRank(input: unknown, field: string): number | null | undefined {
  if (typeof input === "undefined") return undefined;
  if (input === null) return null;
  return normalizeNonNegativeInteger(input, field);
}

function normalizeOptionalReadyHidden(input: unknown, field: string): boolean | null | undefined {
  if (typeof input === "undefined") return undefined;
  if (input === null) return null;
  if (typeof input !== "boolean") {
    throw new HttpError(400, "invalid_boolean", `${field} must be a boolean or null`);
  }
  return input;
}

function normalizeUpdateWorkspaceReadyQueueStateRequest(
  body: Record<string, unknown>,
): UpdateWorkspaceReadyQueueStateRequest {
  const rawEntries = body.entries;
  if (!Array.isArray(rawEntries)) {
    throw new HttpError(400, "invalid_entries", "entries must be an array");
  }

  const seenWorkpieceIds = new Set<string>();
  const entries = rawEntries.map((rawEntry, index) => {
    if (!isRecord(rawEntry)) {
      throw new HttpError(400, "invalid_entries", `entries[${index}] must be an object`);
    }

    const workpieceId = normalizeUuid(rawEntry.workpiece_id, `entries[${index}].workpiece_id`);
    if (seenWorkpieceIds.has(workpieceId)) {
      throw new HttpError(400, "duplicate_workpiece", "entries must not contain duplicate workpiece_id values");
    }
    seenWorkpieceIds.add(workpieceId);

    const hasQueueRank = Object.prototype.hasOwnProperty.call(rawEntry, "queue_rank");
    const hasHidden = Object.prototype.hasOwnProperty.call(rawEntry, "hidden");
    if (!hasQueueRank && !hasHidden) {
      throw new HttpError(400, "invalid_entries", `entries[${index}] must include queue_rank and/or hidden`);
    }

    const queueRank = hasQueueRank
      ? normalizeOptionalReadyQueueRank(rawEntry.queue_rank, `entries[${index}].queue_rank`)
      : undefined;
    const hidden = hasHidden
      ? normalizeOptionalReadyHidden(rawEntry.hidden, `entries[${index}].hidden`)
      : undefined;

    return {
      workpiece_id: workpieceId,
      ...(typeof queueRank === "undefined" ? {} : { queue_rank: queueRank }),
      ...(typeof hidden === "undefined" ? {} : { hidden }),
    };
  });

  return { entries };
}

function normalizeImageMapIntent(value: unknown): string {
  const normalized = readStringField({ value }, "value")?.toLowerCase() ?? null;
  if (!normalized) return "other";
  return IMAGE_MAP_INTENT_SET.has(normalized) ? normalized : "other";
}

function normalizeImageMapSourceType(value: unknown): string {
  const normalized = readStringField({ value }, "value")?.toLowerCase() ?? null;
  if (!normalized) return "stock";
  return IMAGE_MAP_SOURCE_TYPE_SET.has(normalized) ? normalized : "stock";
}

function normalizeImageMapStatus(value: unknown): string {
  const normalized = readStringField({ value }, "value")?.toLowerCase() ?? null;
  if (!normalized) return "draft";
  return IMAGE_MAP_STATUS_SET.has(normalized) ? normalized : "draft";
}

function normalizeImageMapVisualMode(value: unknown): string | null {
  const normalized = readStringField({ value }, "value")?.toLowerCase() ?? null;
  if (!normalized) return null;
  return IMAGE_MAP_VISUAL_MODE_SET.has(normalized) ? normalized : null;
}

function normalizeImageMapAssetRef(
  value: unknown,
  field: string,
): EpisodeImageMapAssetRefRecord {
  if (!isRecord(value)) {
    throw new HttpError(400, "invalid_entries", `${field} must be an object`);
  }

  const assetId = readStringField(value, "asset_id") ?? readStringField(value, "id");
  if (!assetId) {
    throw new HttpError(400, "invalid_entries", `${field}.asset_id must be a non-empty string`);
  }

  return {
    asset_id: assetId,
    path: readStringField(value, "path"),
    variant_label: readStringField(value, "variant_label"),
    visual_mode: normalizeImageMapVisualMode(value.visual_mode),
    mime_type: readStringField(value, "mime_type"),
  };
}

function normalizeImageMapAssetRefs(value: unknown, field: string): EpisodeImageMapAssetRefRecord[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: EpisodeImageMapAssetRefRecord[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entry = normalizeImageMapAssetRef(value[index], `${field}[${index}]`);
    if (seen.has(entry.asset_id)) continue;
    seen.add(entry.asset_id);
    out.push(entry);
  }
  return out;
}

function normalizeImageMapScriptAnchor(
  value: unknown,
  field: string,
): EpisodeImageMapScriptAnchorRecord | null {
  if (value == null) return null;
  if (!isRecord(value)) {
    throw new HttpError(400, "invalid_entries", `${field} must be an object`);
  }

  const sectionId = readStringField(value, "section_id");
  const paragraphId = readStringField(value, "paragraph_id");
  const paragraphOrder = typeof value.paragraph_order === "number" ? Math.trunc(value.paragraph_order) : null;
  const sentenceStart = typeof value.sentence_start === "number" ? Math.trunc(value.sentence_start) : null;
  const sentenceEnd = typeof value.sentence_end === "number" ? Math.trunc(value.sentence_end) : null;
  const charStart = typeof value.char_start === "number" ? Math.trunc(value.char_start) : null;
  const charEnd = typeof value.char_end === "number" ? Math.trunc(value.char_end) : null;
  const spanText = readStringField(value, "span_text");

  if (
    !sectionId
    || !paragraphId
    || paragraphOrder == null
    || sentenceStart == null
    || sentenceEnd == null
    || charStart == null
    || charEnd == null
    || !spanText
  ) {
    throw new HttpError(400, "invalid_entries", `${field} must include complete structured anchor fields`);
  }

  if (paragraphOrder < 1 || sentenceStart < 1 || sentenceEnd < sentenceStart || charStart < 0 || charEnd <= charStart) {
    throw new HttpError(400, "invalid_entries", `${field} contains invalid structured anchor ranges`);
  }

  return {
    section_id: sectionId,
    paragraph_id: paragraphId,
    paragraph_order: paragraphOrder,
    sentence_start: sentenceStart,
    sentence_end: sentenceEnd,
    char_start: charStart,
    char_end: charEnd,
    span_text: spanText,
    speaker_block_id: readStringField(value, "speaker_block_id"),
  };
}

function normalizeEpisodeImageMapEntry(
  value: unknown,
  index: number,
): EpisodeImageMapEntryRecord {
  if (!isRecord(value)) {
    throw new HttpError(400, "invalid_entries", `entries[${index}] must be an object`);
  }

  const fallbackId = `image-map-${String(index + 1).padStart(2, "0")}`;
  const id = readStringField(value, "id") ?? fallbackId;
  const scriptAnchor = normalizeImageMapScriptAnchor(value.script_anchor, `entries[${index}].script_anchor`);
  const anchor = readStringField(value, "anchor")
    ?? (scriptAnchor
      ? `${scriptAnchor.paragraph_id}#${scriptAnchor.sentence_start === scriptAnchor.sentence_end
        ? `sent${scriptAnchor.sentence_start}`
        : `sent${scriptAnchor.sentence_start}-${scriptAnchor.sentence_end}`}`
      : null);
  if (!anchor) {
    throw new HttpError(400, "invalid_entries", `entries[${index}].anchor must be a non-empty string`);
  }

  const descriptionRaw = value.description;
  const description = typeof descriptionRaw === "string"
    ? descriptionRaw
    : descriptionRaw == null
      ? ""
      : String(descriptionRaw);
  const candidateAssets = normalizeImageMapAssetRefs(value.candidate_assets, `entries[${index}].candidate_assets`);
  const selectedAssetId = readStringField(value, "selected_asset_id");
  if (selectedAssetId && !candidateAssets.some((asset) => asset.asset_id === selectedAssetId)) {
    throw new HttpError(
      400,
      "invalid_selected_asset",
      `entries[${index}].selected_asset_id must refer to one of entries[${index}].candidate_assets`,
      {
        entry_id: id,
        selected_asset_id: selectedAssetId,
      },
    );
  }
  const normalizedStatus = normalizeImageMapStatus(value.status ?? (scriptAnchor ? "mapped" : "draft"));
  const status = selectedAssetId
    ? "selected"
    : candidateAssets.length > 0
      ? "candidates_generated"
      : normalizedStatus === "selected"
        ? (scriptAnchor ? "mapped" : "draft")
        : normalizedStatus;

  return {
    id,
    anchor,
    script_anchor: scriptAnchor,
    description,
    visual_intent: readStringField(value, "visual_intent") ?? description,
    prompt_basis: readStringField(value, "prompt_basis") ?? description,
    style_preset: normalizeHearthVisualStyle(value.style_preset ?? null),
    intent: normalizeImageMapIntent(value.intent),
    source_type: normalizeImageMapSourceType(value.source_type),
    beat_order: typeof value.beat_order === "number" ? Math.max(1, Math.trunc(value.beat_order)) : index + 1,
    paragraph_beat_order: typeof value.paragraph_beat_order === "number"
      ? Math.max(1, Math.trunc(value.paragraph_beat_order))
      : 1,
    candidate_assets: candidateAssets,
    selected_asset_id: selectedAssetId,
    status,
    placement_hint: readStringField(value, "placement_hint"),
  };
}

function normalizeEpisodeImageMapEntries(value: unknown): EpisodeImageMapEntryRecord[] {
  if (!Array.isArray(value)) return [];
  const out: EpisodeImageMapEntryRecord[] = [];
  for (let index = 0; index < value.length; index += 1) {
    out.push(normalizeEpisodeImageMapEntry(value[index], index));
  }
  return out;
}

function normalizeSaveWorkpieceImageMapRequest(
  body: Record<string, unknown>,
): SaveWorkpieceImageMapRequest {
  const rawEntries = body.entries;
  if (!Array.isArray(rawEntries)) {
    throw new HttpError(400, "invalid_entries", "entries must be an array");
  }

  const entries = normalizeEpisodeImageMapEntries(rawEntries);
  const seenIds = new Set<string>();
  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new HttpError(400, "duplicate_entry_id", "entries must not contain duplicate ids", {
        entry_id: entry.id,
      });
    }
    seenIds.add(entry.id);
  }

  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    entries,
    ...(Object.prototype.hasOwnProperty.call(body, "expected_metadata_updated_at")
      ? {
        expected_metadata_updated_at: body.expected_metadata_updated_at === null
          ? null
          : normalizeIsoTimestamp(body.expected_metadata_updated_at, "expected_metadata_updated_at"),
      }
      : {}),
  };
}

function normalizeGenerateImageMapCandidatesRequest(
  body: Record<string, unknown>,
  userAccessToken: string,
): GenerateImageMapCandidatesRequest {
  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    image_map_entry_id: normalizeNonEmptyString(body.image_map_entry_id, "image_map_entry_id"),
    ...(Object.prototype.hasOwnProperty.call(body, "expected_metadata_updated_at")
      ? {
        expected_metadata_updated_at: body.expected_metadata_updated_at === null
          ? null
          : normalizeIsoTimestamp(body.expected_metadata_updated_at, "expected_metadata_updated_at"),
      }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "context_before")
      ? { context_before: readNullableStringField(body, "context_before") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "context_after")
      ? { context_after: readNullableStringField(body, "context_after") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "aspect")
      ? { aspect: readNullableStringField(body, "aspect") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "size")
      ? { size: readNullableStringField(body, "size") }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "lane")
      ? { lane: body.lane === "byo" ? "byo" : "forge" }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "confirm_spend")
      ? { confirm_spend: Boolean(body.confirm_spend) }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(body, "always_approve_ai_spend")
      ? { always_approve_ai_spend: Boolean(body.always_approve_ai_spend) }
      : {}),
    user_access_token: userAccessToken,
  };
}

function normalizeArchiveWorkpieceRequest(body: Record<string, unknown>): ArchiveWorkpieceRequest {
  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
    ...(Object.prototype.hasOwnProperty.call(body, "reason")
      ? { reason: readNullableStringField(body, "reason") }
      : {}),
  };
}

function normalizeRestoreWorkpieceRequest(body: Record<string, unknown>): RestoreWorkpieceRequest {
  return {
    workspace_id: normalizeUuid(body.workspace_id, "workspace_id"),
  };
}

function buildImageMapAssetDocument(
  workpieceId: string,
  entries: EpisodeImageMapEntryRecord[],
): Record<string, unknown> {
  return {
    schema: IMAGE_MAP_ASSET_SCHEMA,
    workpiece_id: workpieceId,
    entries,
  };
}

function buildImageMapCandidateAssetPath(args: {
  workpieceId: string;
  entryId: string;
  assetId: string;
  variantLabel: string;
  mimeType: string;
}): string {
  const extension = args.mimeType.toLowerCase().includes("jpeg") ? "jpg" : "png";
  const variantSlug = args.variantLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "candidate";
  return `${IMAGE_MAP_CANDIDATE_ASSET_PREFIX}/${args.workpieceId}/${args.entryId}/${args.assetId}-${variantSlug}.${extension}`;
}

function inferImageMapVisualMode(entry: EpisodeImageMapEntryRecord, contextText: string): string {
  const text = `${entry.visual_intent} ${entry.prompt_basis} ${entry.script_anchor?.span_text ?? ""} ${contextText}`.toLowerCase();
  if (/\b(map|route|territory|delta|river|coast|atlantic|mississippi|new orleans|geography|location)\b/.test(text)) {
    return /\b(location|city|port|new orleans|mississippi)\b/.test(text) ? "location" : "map";
  }
  if (/\b(compare|comparison|versus|vs\b|ratio|outnumber|count|troops|more than|less than)\b/.test(text)) {
    return "comparison";
  }
  if (/\b(person|figure|leader|general|commander|president|portrait|officer)\b/.test(text)) {
    return "person_figure";
  }
  if (/\b(object|artifact|weapon|document|detail|close-up|close up)\b/.test(text)) {
    return "object_detail";
  }
  if (/\b(strategy|strategic|concept|system|network|structure|relationship|explainer)\b/.test(text)) {
    return "concept_illustration";
  }
  return "event_scene";
}

function buildImageMapCandidatePrompt(args: {
  entry: EpisodeImageMapEntryRecord;
  visualMode: string;
  variantLabel: string;
  contextBefore: string | null;
  contextAfter: string | null;
  divergenceHint?: string | null;
}): string {
  const spanText = args.entry.script_anchor?.span_text ?? args.entry.description;
  const contextLines = [
    args.contextBefore ? `Previous context: ${args.contextBefore}` : null,
    spanText ? `Exact beat span: ${spanText}` : null,
    args.contextAfter ? `Following context: ${args.contextAfter}` : null,
  ].filter(Boolean);

  const modeInstruction = (() => {
    switch (args.visualMode) {
      case "comparison":
        return "Create a clean explanatory comparison image with obvious visual contrast between the two compared sides.";
      case "map":
        return "Create a clear strategic map-style visual with readable geography, but no text, labels, or numbers inside the image.";
      case "location":
        return "Create a clear location-establishing still that makes the place immediately legible on screen.";
      case "person_figure":
        return "Create a historically grounded figure-focused still with a clear subject and restrained background clutter.";
      case "object_detail":
        return "Create a clean object/detail still with a strong silhouette and obvious subject emphasis.";
      case "concept_illustration":
        return "Create an explanatory concept illustration that clarifies the idea visually without relying on text in the image.";
      default:
        return "Create a clear editorial still that makes the event or action immediately legible on screen.";
    }
  })();

  const variantInstruction = args.variantLabel === "explainer"
    ? "Variant goal: make the beat clearer and more diagrammatic or explanatory."
    : "Variant goal: make the beat more cinematic and illustrative while staying factual and clear.";

  return [
    `You are generating a still image candidate for a scripted visual beat.`,
    `Visual intent: ${args.entry.visual_intent || args.entry.description}`,
    `Prompt basis: ${args.entry.prompt_basis || args.entry.description}`,
    ...buildHearthVisualStylePromptLines(args.entry.style_preset),
    `Visual mode: ${args.visualMode}.`,
    contextLines.join("\n"),
    modeInstruction,
    variantInstruction,
    "Bias toward clean composition, obvious subject, strong silhouette, readable geography, restrained clutter, and contextual accuracy.",
    "Do not render text, labels, captions, numbers, or map lettering into the image.",
    args.divergenceHint ? args.divergenceHint : null,
  ].filter(Boolean).join("\n\n");
}

function buildImageMapCandidateAssetMetadata(args: {
  entry: EpisodeImageMapEntryRecord;
  visualMode: string;
  variantLabel: string;
  prompt: string;
  revisedPrompt: string | null;
  aspect: string | null;
  size: string | null;
}): Json {
  return {
    schema: IMAGE_MAP_CANDIDATE_ASSET_SCHEMA,
    image_map_entry_id: args.entry.id,
    visual_mode: args.visualMode,
    variant_label: args.variantLabel,
    beat_order: args.entry.beat_order,
    paragraph_beat_order: args.entry.paragraph_beat_order,
    style_preset: args.entry.style_preset,
    prompt: args.prompt,
    revised_prompt: args.revisedPrompt,
    visual_intent: args.entry.visual_intent,
    prompt_basis: args.entry.prompt_basis,
    script_anchor: args.entry.script_anchor as unknown as Json,
    aspect: args.aspect,
    size: args.size,
  } as Json;
}

function buildThumbnailAssetMetadata(args: {
  conceptId: string;
  conceptLabel: string;
  conceptPrompt: string;
  stylePreset: string | null;
  aspect: string | null;
  size: string | null;
  finalPrompt: string;
  revisedPrompt: string | null;
}): Json {
  return {
    schema: THUMBNAIL_ASSET_SCHEMA,
    concept_id: args.conceptId,
    concept_label: args.conceptLabel,
    concept_prompt: args.conceptPrompt,
    style_preset: args.stylePreset,
    aspect: args.aspect,
    size: args.size,
    prompt: args.finalPrompt,
    revised_prompt: args.revisedPrompt,
  } as Json;
}

function normalizeImageMapCandidateAssetSummary(row: AssetRow): ImageMapCandidateAssetSummary | null {
  if (row.asset_kind !== IMAGE_MAP_CANDIDATE_ASSET_KIND || row.status !== "ready") return null;
  const metadata = isRecord(row.metadata_json) ? row.metadata_json as Record<string, unknown> : null;
  const schema = metadata ? readStringField(metadata, "schema") : null;
  const imageMapEntryId = metadata ? readStringField(metadata, "image_map_entry_id") : null;
  const variantLabel = metadata ? readStringField(metadata, "variant_label") : null;
  const visualMode = metadata ? normalizeImageMapVisualMode(metadata.visual_mode) : null;
  if (schema !== IMAGE_MAP_CANDIDATE_ASSET_SCHEMA || !imageMapEntryId || !variantLabel || !visualMode) {
    return null;
  }
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    episode_id: row.workpiece_id,
    image_map_entry_id: imageMapEntryId,
    path: row.path,
    storage_bucket: row.storage_bucket,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    bytes: row.bytes,
    provider: row.provider,
    provider_request_id: row.provider_request_id,
    request_id: row.request_id ?? "",
    variant_label: variantLabel,
    visual_mode: visualMode,
    prompt: row.prompt ?? "",
    status: "ready",
  };
}

function readImageMapAssetMetadata(value: unknown): ImageMapAssetSummary["metadata_json"] | null {
  if (!isRecord(value)) return null;
  const schema = readStringField(value, "schema");
  const entryCountRaw = value.entry_count;
  if (schema !== IMAGE_MAP_ASSET_SCHEMA || typeof entryCountRaw !== "number" || !Number.isFinite(entryCountRaw)) {
    return null;
  }
  return {
    schema: IMAGE_MAP_ASSET_SCHEMA,
    entry_count: Math.max(0, Math.trunc(entryCountRaw)),
  };
}

function normalizeImageMapAssetSummary(row: AssetRow | null | undefined): ImageMapAssetSummary | null {
  if (!row) return null;
  if (row.asset_kind !== IMAGE_MAP_ASSET_KIND || row.status !== "ready" || row.path !== IMAGE_MAP_ASSET_PATH) {
    return null;
  }
  const metadataJson = readImageMapAssetMetadata(row.metadata_json);
  if (!metadataJson) return null;
  return {
    id: row.id,
    asset_kind: IMAGE_MAP_ASSET_KIND,
    status: "ready",
    path: IMAGE_MAP_ASSET_PATH,
    storage_bucket: row.storage_bucket,
    storage_key: row.storage_key,
    metadata_json: metadataJson,
    created_at: row.created_at,
    updated_at: row.updated_at,
    supersedes_asset_id: row.supersedes_asset_id,
  };
}

function normalizeWorkpieceVisualPackageSelectedAsset(
  row: AssetRow | null | undefined,
): WorkpieceVisualPackageSelectedAsset | null {
  if (!row) return null;
  if (row.asset_kind !== IMAGE_MAP_CANDIDATE_ASSET_KIND || row.status !== "ready") {
    return null;
  }

  const metadata = isRecord(row.metadata_json) ? row.metadata_json as Record<string, unknown> : null;
  const variantLabel = metadata ? readStringField(metadata, "variant_label") : null;
  const visualMode = metadata ? normalizeImageMapVisualMode(metadata.visual_mode) : null;

  return {
    asset_id: row.id,
    path: row.path,
    storage_bucket: row.storage_bucket,
    storage_key: row.storage_key,
    mime_type: row.mime_type,
    bytes: row.bytes,
    created_at: row.created_at,
    updated_at: row.updated_at,
    variant_label: variantLabel,
    visual_mode: visualMode,
  };
}

function randomId(prefix: string): string {
  const cryptoApi = globalThis.crypto as typeof globalThis.crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function randomUuid(): string {
  const cryptoApi = globalThis.crypto as typeof globalThis.crypto | undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  const suffix = Math.random().toString(16).slice(2, 14).padEnd(12, "0");
  return `00000000-0000-4000-8000-${suffix.slice(0, 12)}`;
}

function parseBase64ByteLength(base64: string): number {
  const clean = base64.replace(/\s+/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function estimateImageTokenSpend(prompt: string, tokensFromProvider: number | null): number {
  if (typeof tokensFromProvider === "number" && Number.isFinite(tokensFromProvider) && tokensFromProvider > 0) {
    return Math.ceil(tokensFromProvider);
  }
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function normalizeThumbnailConcept(value: unknown): EpisodeThumbnailConceptRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readStringField(row, "id");
  const label = readStringField(row, "label");
  const promptText = readStringField(row, "prompt_text");
  if (!id || !label || !promptText) return null;
  return {
    id,
    label,
    prompt_text: promptText,
    style_preset: normalizeHearthVisualStyle(readStringField(row, "style_preset")),
  };
}

function normalizeThumbnailVersion(value: unknown): ThumbnailVersionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const id = readStringField(row, "id");
  const conceptId = readStringField(row, "concept_id");
  const createdAt = readStringField(row, "created_at");
  const provider = readStringField(row, "provider");
  const prompt = readStringField(row, "prompt");
  const assetId = readStringField(row, "asset_id");
  const statusRaw = readStringField(row, "status");
  const status = statusRaw === "failed" ? "failed" : statusRaw === "ready" ? "ready" : null;
  if (!id || !conceptId || !createdAt || !provider || !prompt || !assetId || !status) return null;
  return {
    id,
    concept_id: conceptId,
    created_at: createdAt,
    provider,
    prompt,
    provider_request_id: readStringField(row, "provider_request_id"),
    asset_id: assetId,
    asset_path: readStringField(row, "asset_path"),
    mime_type: readStringField(row, "mime_type"),
    status,
    error: readStringField(row, "error"),
  };
}

function readStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readNullableStringField(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new HttpError(400, "invalid_string", `Invalid ${key}`);
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeEpisodePackageRecord(metadata: Record<string, unknown>): EpisodePackageRecord {
  const episodeRoot = (
    metadata.episode
    && typeof metadata.episode === "object"
    && !Array.isArray(metadata.episode)
  )
    ? (metadata.episode as Record<string, unknown>)
    : {};

  const seoRoot = (
    episodeRoot.seo
    && typeof episodeRoot.seo === "object"
    && !Array.isArray(episodeRoot.seo)
  )
    ? (episodeRoot.seo as Record<string, unknown>)
    : {};

  const thumbnailRoot = (
    episodeRoot.thumbnail
    && typeof episodeRoot.thumbnail === "object"
    && !Array.isArray(episodeRoot.thumbnail)
  )
    ? (episodeRoot.thumbnail as Record<string, unknown>)
    : {};

  const imageMapRoot = (
    episodeRoot.image_map
    && typeof episodeRoot.image_map === "object"
    && !Array.isArray(episodeRoot.image_map)
  )
    ? (episodeRoot.image_map as Record<string, unknown>)
    : {};
  const launchVariants = Array.isArray(episodeRoot.launch_variants)
    ? episodeRoot.launch_variants as JsonValue[]
    : Array.isArray(metadata.launch_variants)
      ? metadata.launch_variants as JsonValue[]
      : [];

  const concepts = Array.isArray(thumbnailRoot.concepts)
    ? thumbnailRoot.concepts.map((entry) => normalizeThumbnailConcept(entry)).filter(Boolean) as EpisodeThumbnailConceptRecord[]
    : [];

  const versions = Array.isArray(thumbnailRoot.versions)
    ? thumbnailRoot.versions.map((entry) => normalizeThumbnailVersion(entry)).filter(Boolean) as ThumbnailVersionRecord[]
    : [];

  const tags = Array.isArray(seoRoot.tags)
    ? seoRoot.tags
      .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
      .filter((entry) => !!entry)
    : [];
  const dedupedTags = Array.from(new Set(tags));

  return {
    schema: "forge.episode.package.v2",
    seo: {
      titles: Array.isArray(seoRoot.titles) ? seoRoot.titles as JsonValue[] : [],
      tags: dedupedTags,
      description_short: readStringField(seoRoot, "description_short"),
      description_long: readStringField(seoRoot, "description_long"),
    },
    thumbnail: {
      concepts,
      versions,
      primary_version_id: readStringField(thumbnailRoot, "primary_version_id"),
    },
    launch_variants: launchVariants,
    image_map: {
      entries: normalizeEpisodeImageMapEntries(imageMapRoot.entries),
    },
  };
}

function mirrorEpisodePackageToMetadata(
  metadata: Record<string, unknown>,
  episodePackage: EpisodePackageRecord,
): Record<string, unknown> {
  return {
    ...metadata,
    episode: episodePackage,
    seo_titles: episodePackage.seo.titles,
    tags: episodePackage.seo.tags,
    description_short: episodePackage.seo.description_short,
    description_long: episodePackage.seo.description_long,
    thumbnail_concepts: episodePackage.thumbnail.concepts,
    thumbnail_versions: episodePackage.thumbnail.versions,
    primary_thumbnail_version_id: episodePackage.thumbnail.primary_version_id,
    launch_variants: episodePackage.launch_variants,
    image_map_entries: episodePackage.image_map.entries,
  };
}

function ensureMetadataBase(args: {
  metadata: Record<string, unknown> | null;
  workpieceId: string;
  workspaceId: string;
}): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  const base = args.metadata ?? {
    schema: "forge.metadata.v1",
    workpiece_id: args.workpieceId,
    workspace_id: args.workspaceId,
    created_at: nowIso,
    updated_at: nowIso,
    status: "draft",
    notes: null,
    origin: null,
    content_category: null,
  };
  if (!base.workpiece_id) base.workpiece_id = args.workpieceId;
  if (!base.workspace_id) base.workspace_id = args.workspaceId;
  if (!base.schema) base.schema = "forge.metadata.v1";
  if (!base.created_at) base.created_at = nowIso;
  if (!base.status) base.status = "draft";
  base.updated_at = nowIso;
  return base;
}

function resolveEpisodeLabel(metadata: Json | undefined): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const row = metadata as Record<string, unknown>;
    if (typeof row.label === "string" && row.label.trim()) return row.label.trim();
    if (typeof row.title === "string" && row.title.trim()) return row.title.trim();
  }
  return "Untitled Episode";
}

function isPlaceholderEpisodeLabel(label: string | null | undefined): boolean {
  const normalized = (label ?? "").trim().toLowerCase();
  if (!normalized) return true;
  if (normalized === "untitled" || normalized === "untitled episode" || normalized === "untitled project") return true;
  if (normalized === "draft script") return true;
  return /^episode [0-9a-f]{8}$/i.test(normalized);
}

function isGenericProjectLabel(label: string | null | undefined): boolean {
  const normalized = (label ?? "").trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === "project") return true;
  if (/^project [0-9a-f]{8}$/i.test(normalized)) return true;
  return /^project [0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

function sanitizeReadyDisplayTitle(title: string | null | undefined): string | null {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return null;
  if (isPlaceholderEpisodeLabel(trimmed)) return null;
  if (isGenericProjectLabel(trimmed)) return null;
  return trimmed;
}

function extractScriptTitleFromText(scriptText: string): string | null {
  const lines = normalizeLf(stripBom(scriptText))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const cleaned = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^>\s+/, "")
      .trim();
    if (!cleaned) continue;
    if (!sanitizeReadyDisplayTitle(cleaned)) continue;
    return cleaned.length > 160 ? `${cleaned.slice(0, 157)}...` : cleaned;
  }
  return null;
}

function readyScriptPathPriority(path: string): number {
  const index = READY_SCRIPT_PATH_CANDIDATES.indexOf(path as (typeof READY_SCRIPT_PATH_CANDIDATES)[number]);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function toWorkspaceEpisodeSummary(row: EpisodeRow): WorkspaceEpisodeSummary {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    label: row.label ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at ?? null,
    archived_by: row.archived_by ?? null,
    archive_reason: row.archive_reason ?? null,
  };
}

function toWorkspaceSparkSummary(
  row: {
    id: string;
    workspace_id: string;
    assignment_id: string | null;
    title: string | null;
    body: string;
    tags: string[] | null;
    status: string | null;
    created_at: string;
    updated_at: string;
  },
  linkedWorkpieceId: string | null,
): WorkspaceSparkSummary {
  return {
    id: row.id,
    workspace_id: row.workspace_id,
    assignment_id: row.assignment_id,
    title: row.title,
    body: row.body,
    tags: Array.isArray(row.tags) ? row.tags.filter((value): value is string => typeof value === "string") : [],
    status: typeof row.status === "string" && row.status.trim() ? row.status : "raw",
    created_at: row.created_at,
    updated_at: row.updated_at,
    linked_workpiece_id: linkedWorkpieceId,
  };
}

function compareWorkspaceReadyScripts(a: WorkspaceReadyScript, b: WorkspaceReadyScript): number {
  const aRank = a.queue_rank;
  const bRank = b.queue_rank;
  if (aRank != null && bRank != null) {
    if (aRank !== bRank) return aRank - bRank;
  } else if (aRank != null) {
    return -1;
  } else if (bRank != null) {
    return 1;
  }

  const byUpdated = b.updated_at.localeCompare(a.updated_at);
  if (byUpdated !== 0) return byUpdated;
  return a.title.localeCompare(b.title);
}

function readyScriptMetaKey(workpieceId: string, scriptPath: string): string {
  return `${workpieceId}:${scriptPath}`;
}

function normalizeContentCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return CONTENT_CATEGORY_SET.has(normalized) ? normalized : null;
}

function readContentCategoryFromEventPayload(payload: Json): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const row = payload as Record<string, unknown>;
  return normalizeContentCategory(row.content_category);
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTakeReceiptFromEvent(row: Pick<WorkpieceEventRow, "id" | "created_at" | "payload">): WorkpieceTakeReceipt {
  const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload as Record<string, unknown>
    : {};
  return {
    event_id: row.id,
    created_at: row.created_at,
    file_path: readNullableString(payload.file_path ?? payload.path),
    recording_session_id: readNullableString(payload.recording_session_id),
    anvil_capture_session_id: readNullableString(payload.anvil_capture_session_id),
    content_type: readNullableString(payload.content_type),
    bytes: readNullableNumber(payload.bytes),
    duration_ms: readNullableNumber(payload.duration_ms),
    original_name: readNullableString(payload.original_name),
  };
}

function pushCanonicalRecordingPathNode(
  nodes: WorkspaceStorageTreeNode[],
  parentPath: string,
  relativePath: string,
  receipt: WorkpieceTakeReceipt,
): void {
  const segments = relativePath.split("/").filter(Boolean);
  if (!segments.length) return;

  const [head, ...tail] = segments;
  const path = joinRelativePath(parentPath, head);

  if (tail.length === 0) {
    nodes.push({
      name: head,
      kind: "file",
      path,
      bytes: receipt.bytes,
      updated_at: receipt.created_at,
      ...(receipt.original_name && receipt.original_name !== head
        ? { note: `Original name: ${receipt.original_name}` }
        : {}),
    });
    return;
  }

  let directoryNode = nodes.find((node) => node.kind === "directory" && node.path === path);
  if (!directoryNode) {
    directoryNode = {
      name: head,
      kind: "directory",
      path,
      children: [],
    };
    nodes.push(directoryNode);
  }
  if (!directoryNode.children) {
    directoryNode.children = [];
  }
  pushCanonicalRecordingPathNode(directoryNode.children, path, tail.join("/"), receipt);
  directoryNode.children.sort(compareWorkspaceStorageNodes);
}

function buildCanonicalRecordingWorkpieceNode(
  episode: Pick<EpisodeRow, "id" | "label">,
  receipt: WorkpieceTakeReceipt,
): WorkspaceStorageTreeNode {
  const workpieceRootPath = `workpieces/${episode.id}`;
  const children: WorkspaceStorageTreeNode[] = [];
  const normalizedRecordingPath = normalizeOptionalRelativePath(receipt.file_path);

  if (normalizedRecordingPath) {
    pushCanonicalRecordingPathNode(children, workpieceRootPath, normalizedRecordingPath, receipt);
  } else {
    children.push({
      name: receipt.original_name ?? "Kept take path unavailable",
      kind: "file",
      path: joinRelativePath(workpieceRootPath, "__path_unavailable__"),
      bytes: receipt.bytes,
      updated_at: receipt.created_at,
      note: "Kept take event is missing a canonical file path.",
    });
  }

  children.sort(compareWorkspaceStorageNodes);
  return {
    name: episode.label?.trim() || episode.id,
    kind: "directory",
    path: workpieceRootPath,
    note: episode.id,
    children,
  };
}

function toRecordingSessionItemDTO(row: RecordingSessionItemRow): RecordingSessionItemDTO {
  return {
    position: row.position,
    episode_id: row.episode_id,
    script_path: row.script_path,
  };
}

function toRecordingSessionDTO(session: RecordingSessionRow, items: RecordingSessionItemRow[]): RecordingSessionDTO {
  return {
    id: session.id,
    workspace_id: session.workspace_id,
    title: session.title,
    calendar_event_id: session.calendar_event_id,
    items: items.map(toRecordingSessionItemDTO),
  };
}

export class TongsCommitService {
  readonly supabase: SupabaseClient<Database>;
  readonly bucket: string;
  readonly imageProvider: ImageProvider | null;

  constructor(supabase: SupabaseClient<Database>, bucket = TONGS_WORKPIECE_BUCKET, imageProvider: ImageProvider | null = null) {
    this.supabase = supabase;
    this.bucket = bucket;
    this.imageProvider = imageProvider;
  }

  private async getCradleOrThrow(workpieceId: string): Promise<EpisodeRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .select("*")
      .eq("id", workpieceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "workpiece_not_found", `Workpiece ${workpieceId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read episode", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "workpiece_not_found", `Workpiece ${workpieceId} was not found`);
    }
    return data;
  }

  private async getWorkspaceOrThrow(workspaceId: string): Promise<WorkspaceRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workspaces")
      .select("*")
      .eq("id", workspaceId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "workspace_not_found", `Workspace ${workspaceId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read workspace", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "workspace_not_found", `Workspace ${workspaceId} was not found`);
    }
    return data;
  }

  private async getRecordingSessionOrThrow(sessionId: string): Promise<RecordingSessionRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "recording_session_not_found", `Recording session ${sessionId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read recording session", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "recording_session_not_found", `Recording session ${sessionId} was not found`);
    }
    return data;
  }

  private async listRecordingSessionItems(sessionId: string): Promise<RecordingSessionItemRow[]> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_session_items")
      .select("*")
      .eq("session_id", sessionId)
      .order("position", { ascending: true })
      .order("episode_id", { ascending: true });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read recording session items", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  private async removeRecordingSessionItemsForScript(
    workpieceId: string,
    scriptPath: string,
  ): Promise<number> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_session_items")
      .delete()
      .eq("episode_id", workpieceId)
      .eq("script_path", scriptPath)
      .select("id");

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to cleanup recording session plan items", {
        reason: error.message,
      });
    }

    return (data ?? []).length;
  }

  private async upsertReadyScriptMeta(
    workspaceId: string,
    workpieceId: string,
    scriptPath: string,
    userId: string,
  ): Promise<void> {
    const payload: Database["tongs"]["Tables"]["workpiece_ready_script_meta"]["Insert"] = {
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      script_path: scriptPath,
      marked_ready_by: userId,
      marked_ready_at: new Date().toISOString(),
      updated_by: userId,
    };

    const { error } = await this.supabase
      .schema("tongs")
      .from("workpiece_ready_script_meta")
      .upsert(payload, {
        onConflict: "workpiece_id,script_path",
      });

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert ready script metadata", {
        reason: error.message,
      });
    }

    // Ready queue invariant: exactly one active ready pointer per workpiece.
    const { error: cleanupError } = await this.supabase
      .schema("tongs")
      .from("workpiece_ready_script_meta")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .neq("script_path", scriptPath);

    if (cleanupError) {
      throw new HttpError(502, "db_write_failed", "Failed to supersede previous ready script pointers", {
        reason: cleanupError.message,
      });
    }
  }

  private async deleteReadyScriptMeta(
    workspaceId: string,
    workpieceId: string,
    scriptPath: string,
  ): Promise<boolean> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workpiece_ready_script_meta")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("script_path", scriptPath)
      .select("workpiece_id,script_path");

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to delete ready script metadata", {
        reason: error.message,
      });
    }

    return (data ?? []).length > 0;
  }

  private async clearReadyEligibilityOnRestore(
    cradle: EpisodeRow,
  ): Promise<{
    clearedPaths: string[];
    clearedReadyMetaCount: number;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const { data: readyFileRows, error: readyFileRowsError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", cradle.id)
      .in("path", READY_SCRIPT_PATH_CANDIDATES as unknown as string[]);

    if (readyFileRowsError) {
      throw new HttpError(502, "db_read_failed", "Failed to read ready script rows during restore", {
        reason: readyFileRowsError.message,
      });
    }

    const readyFiles = (readyFileRows ?? []).filter((row) => READY_SCRIPT_PATH_SET.has(row.path));
    const clearedPaths = Array.from(new Set(readyFiles.map((row) => row.path)));
    const nowIso = new Date().toISOString();

    if (clearedPaths.length > 0) {
      const manifest = await this.loadManifestOrDefault(cradle);
      manifest.updated_at = nowIso;
      for (const path of clearedPaths) {
        delete manifest.files[path];
      }
      const clearedPathSet = new Set(clearedPaths);
      for (const pointerKey of Object.keys(manifest.pointers) as ManifestPointerKey[]) {
        if (clearedPathSet.has(manifest.pointers[pointerKey] ?? "")) {
          manifest.pointers[pointerKey] = null;
        }
      }

      const finalized = await finalizeManifestTwoPass(manifest, DEFAULT_WRITTEN_BY, nowIso);
      await uploadStorageObject(
        this.supabase,
        this.bucket,
        buildStorageKey(cradle.id, MANIFEST_PATH),
        finalized.manifestBytes,
        "application/json",
      );
      await this.upsertWorkpieceFile([
        {
          workpiece_id: cradle.id,
          path: MANIFEST_PATH,
          file_type: "manifest",
          content_type: "application/json",
          bytes: finalized.finalBytes,
          hash_algo: SHA256_ALGO,
          hash_value: finalized.finalHash,
          storage_bucket: this.bucket,
          storage_key: buildStorageKey(cradle.id, MANIFEST_PATH),
          written_by_tool: DEFAULT_WRITTEN_BY.tool,
          written_by_tool_version: DEFAULT_WRITTEN_BY.tool_version,
          written_by_lane: DEFAULT_WRITTEN_BY.lane,
        },
      ]);

      const { error: deleteReadyFilesError } = await this.supabase
        .schema("tongs")
        .from("workpiece_files")
        .delete()
        .eq("workpiece_id", cradle.id)
        .in("path", clearedPaths);

      if (deleteReadyFilesError) {
        throw new HttpError(502, "db_write_failed", "Failed to clear ready script files during restore", {
          reason: deleteReadyFilesError.message,
        });
      }

      const storageKeysByBucket = new Map<string, string[]>();
      for (const row of readyFiles) {
        const storageBucket = row.storage_bucket?.trim() || this.bucket;
        const storageKey = row.storage_key?.trim() || buildStorageKey(cradle.id, row.path);
        const existingKeys = storageKeysByBucket.get(storageBucket);
        if (existingKeys) {
          if (!existingKeys.includes(storageKey)) existingKeys.push(storageKey);
        } else {
          storageKeysByBucket.set(storageBucket, [storageKey]);
        }
      }

      for (const [storageBucket, storageKeys] of storageKeysByBucket.entries()) {
        const { error: storageDeleteError } = await this.supabase.storage
          .from(storageBucket)
          .remove(storageKeys);
        if (storageDeleteError) {
          logStorageError("delete", storageBucket, storageKeys.join(","), storageDeleteError);
          warnings.push("storage_delete_failed");
        }
      }
    }

    const { data: deletedReadyMetaRows, error: deleteReadyMetaError } = await this.supabase
      .schema("tongs")
      .from("workpiece_ready_script_meta")
      .delete()
      .eq("workspace_id", cradle.workspace_id)
      .eq("workpiece_id", cradle.id)
      .select("workpiece_id,script_path");

    if (deleteReadyMetaError) {
      throw new HttpError(502, "db_write_failed", "Failed to clear ready script metadata during restore", {
        reason: deleteReadyMetaError.message,
      });
    }

    return {
      clearedPaths,
      clearedReadyMetaCount: (deletedReadyMetaRows ?? []).length,
      warnings,
    };
  }

  private async assertWorkpiecesInWorkspace(workspaceId: string, workpieceIds: readonly string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(workpieceIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .in("id", uniqueIds);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to validate workpiece workspace membership", {
        reason: error.message,
      });
    }

    const foundIds = new Set((data ?? []).map((row) => row.id));
    for (const workpieceId of uniqueIds) {
      if (!foundIds.has(workpieceId)) {
        throw new HttpError(400, "workspace_mismatch", "workpiece_id must belong to workspace_id", {
          workpiece_id: workpieceId,
        });
      }
    }
  }

  private async listReadyQueueState(
    workspaceId: string,
    workpieceIds: readonly string[],
  ): Promise<Map<string, WorkspaceReadyQueueStateRow>> {
    const uniqueIds = Array.from(new Set(workpieceIds.filter(Boolean)));
    const out = new Map<string, WorkspaceReadyQueueStateRow>();
    if (uniqueIds.length === 0) return out;

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workspace_ready_queue_state")
      .select("workspace_id,workpiece_id,queue_rank,hidden_at,hidden_by,updated_at,updated_by")
      .eq("workspace_id", workspaceId)
      .in("workpiece_id", uniqueIds);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace ready queue state", {
        reason: error.message,
      });
    }

    for (const row of data ?? []) {
      out.set(row.workpiece_id, row);
    }
    return out;
  }

  async updateWorkspaceReadyQueueState(
    workspaceId: string,
    input: UpdateWorkspaceReadyQueueStateRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<UpdateWorkspaceReadyQueueStateResult> {
    await this.getWorkspaceOrThrow(workspaceId);
    const auth = await this.assertWorkspaceRoleFromAccessToken(workspaceId, "editor", options?.userAccessToken);

    const workpieceIds = input.entries.map((entry) => entry.workpiece_id);
    await this.assertWorkpiecesInWorkspace(workspaceId, workpieceIds);

    const existingByWorkpiece = await this.listReadyQueueState(workspaceId, workpieceIds);
    const nowIso = new Date().toISOString();
    const upsertRows: Database["tongs"]["Tables"]["workspace_ready_queue_state"]["Insert"][] = [];
    const deleteIds: string[] = [];

    for (const entry of input.entries) {
      const existing = existingByWorkpiece.get(entry.workpiece_id) ?? null;
      const nextQueueRank = Object.prototype.hasOwnProperty.call(entry, "queue_rank")
        ? (entry.queue_rank ?? null)
        : (existing?.queue_rank ?? null);

      const hasHidden = Object.prototype.hasOwnProperty.call(entry, "hidden");
      const nextHidden = hasHidden ? (entry.hidden ?? false) : (existing?.hidden_at != null);
      const hiddenAt = nextHidden ? nowIso : null;
      const hiddenBy = nextHidden ? auth.userId : null;

      if (nextQueueRank == null && hiddenAt == null) {
        if (existing) {
          deleteIds.push(entry.workpiece_id);
        }
        continue;
      }

      upsertRows.push({
        workspace_id: workspaceId,
        workpiece_id: entry.workpiece_id,
        queue_rank: nextQueueRank,
        hidden_at: hiddenAt,
        hidden_by: hiddenBy,
        updated_by: auth.userId,
      });
    }

    if (deleteIds.length > 0) {
      const { error } = await this.supabase
        .schema("tongs")
        .from("workspace_ready_queue_state")
        .delete()
        .eq("workspace_id", workspaceId)
        .in("workpiece_id", deleteIds);

      if (error) {
        throw new HttpError(502, "db_write_failed", "Failed to clear ready queue state", {
          reason: error.message,
        });
      }
    }

    if (upsertRows.length > 0) {
      const { error } = await this.supabase
        .schema("tongs")
        .from("workspace_ready_queue_state")
        .upsert(upsertRows, {
          onConflict: "workspace_id,workpiece_id",
        });

      if (error) {
        throw new HttpError(502, "db_write_failed", "Failed to update ready queue state", {
          reason: error.message,
        });
      }
    }

    return {
      updated_count: upsertRows.length,
      deleted_count: deleteIds.length,
    };
  }

  private async assertCalendarEventWorkspace(calendarEventId: string, workspaceId: string): Promise<void> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("calendar_events")
      .select("id,workspace_id")
      .eq("id", calendarEventId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        throw new HttpError(404, "calendar_event_not_found", `Calendar event ${calendarEventId} was not found`);
      }
      throw new HttpError(502, "db_read_failed", "Failed to read calendar event", {
        reason: error.message,
      });
    }

    if (!data) {
      throw new HttpError(404, "calendar_event_not_found", `Calendar event ${calendarEventId} was not found`);
    }

    if (data.workspace_id !== workspaceId) {
      throw new HttpError(400, "workspace_mismatch", "calendar_event_id must belong to the same workspace");
    }
  }

  private async resolveRecordingSessionCreator(workspace: WorkspaceRow): Promise<string> {
    if (workspace.created_by) return workspace.created_by;

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workspace_members")
      .select("user_id,created_at")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to resolve recording session creator", {
        reason: error.message,
      });
    }

    const fallback = data?.[0]?.user_id ?? null;
    if (!fallback) {
      throw new HttpError(
        409,
        "workspace_creator_missing",
        "Workspace has no creator/member to assign recording session created_by",
      );
    }

    return fallback;
  }

  private async resolveUserIdFromAccessToken(accessToken: string | null | undefined): Promise<string | null> {
    const token = accessToken?.trim();
    if (!token) return null;
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error) {
      throw new HttpError(401, "invalid_user_token", "Unable to resolve user from provided access token", {
        reason: error.message,
      });
    }
    return data.user?.id ?? null;
  }

  private async resolveWorkspaceRoleForUser(workspaceId: string, userId: string): Promise<WorkspaceRole | null> {
    const { data: workspaceRow, error: workspaceError } = await this.supabase
      .schema("tongs")
      .from("workspaces")
      .select("id,created_by")
      .eq("id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      throw new HttpError(502, "db_read_failed", "Failed to resolve workspace ownership", {
        reason: workspaceError.message,
      });
    }

    if (!workspaceRow) {
      throw new HttpError(404, "workspace_not_found", `Workspace ${workspaceId} was not found`);
    }

    if (workspaceRow.created_by && workspaceRow.created_by === userId) {
      return "owner";
    }

    const { data: membershipRow, error: membershipError } = await this.supabase
      .schema("tongs")
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipError) {
      throw new HttpError(502, "db_read_failed", "Failed to resolve workspace membership role", {
        reason: membershipError.message,
      });
    }

    return normalizeWorkspaceRole(membershipRow?.role ?? null);
  }

  private async assertWorkspaceRoleFromAccessToken(
    workspaceId: string,
    minRole: WorkspaceRole,
    userAccessToken: string | null | undefined,
  ): Promise<{ userId: string; role: WorkspaceRole }> {
    const userId = await this.resolveUserIdFromAccessToken(userAccessToken);
    if (!userId) {
      throw new HttpError(
        401,
        "missing_user_token_header",
        "Missing x-forge-user-authorization (or x-forge-user-token) header",
      );
    }

    const role = await this.resolveWorkspaceRoleForUser(workspaceId, userId);
    if (!role) {
      throw new HttpError(403, "workspace_access_denied", "You are not a member of this workspace");
    }
    if (!workspaceRoleAtLeast(role, minRole)) {
      throw new HttpError(403, "insufficient_role", `This action requires ${minRole} role or higher`, {
        required: minRole,
        actual: role,
      });
    }

    return { userId, role };
  }

  private async assertWorkpieceInWorkspace(workpieceId: string, workspaceId: string): Promise<EpisodeRow> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    if (cradle.workspace_id !== workspaceId) {
      throw new HttpError(400, "workspace_mismatch", "workpiece_id must belong to workspace_id");
    }
    return cradle;
  }

  private async readWorkpieceImageMapState(
    workpieceId: string,
    workspaceId: string,
  ): Promise<{
    metadata: Record<string, unknown>;
    episodePackage: EpisodePackageRecord;
    metadataUpdatedAt: string | null;
  }> {
    const metadataRead = await this.readWorkpieceJson(workpieceId, "metadata.json");
    const metadataRaw = (
      metadataRead.found
      && metadataRead.data
      && typeof metadataRead.data === "object"
      && !Array.isArray(metadataRead.data)
    )
      ? (metadataRead.data as Record<string, unknown>)
      : null;
    const metadata = ensureMetadataBase({
      metadata: metadataRaw,
      workpieceId,
      workspaceId,
    });
    const episodePackage = normalizeEpisodePackageRecord(metadata);
    return {
      metadata,
      episodePackage,
      metadataUpdatedAt: metadataRead.found
        ? normalizeComparableIsoTimestampOrNull(metadataRead.file_row?.updated_at)
        : null,
    };
  }

  private async getCurrentReadyImageMapAsset(
    workspaceId: string,
    workpieceId: string,
  ): Promise<AssetRow | null> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("asset_kind", IMAGE_MAP_ASSET_KIND)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read current image map asset", {
        reason: error.message,
      });
    }

    return data?.[0] ?? null;
  }

  private async getLatestImageMapAsset(
    workspaceId: string,
    workpieceId: string,
  ): Promise<AssetRow | null> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("asset_kind", IMAGE_MAP_ASSET_KIND)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read latest image map asset", {
        reason: error.message,
      });
    }

    return data?.[0] ?? null;
  }

  private async getImageMapAssetByStorageLocation(
    workspaceId: string,
    workpieceId: string,
    storageBucket: string,
    storageKey: string,
  ): Promise<AssetRow | null> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("asset_kind", IMAGE_MAP_ASSET_KIND)
      .eq("storage_bucket", storageBucket)
      .eq("storage_key", storageKey)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read image map asset by storage location", {
        reason: error.message,
      });
    }

    return data?.[0] ?? null;
  }

  private async listReadyImageMapCandidateAssets(
    workspaceId: string,
    workpieceId: string,
    entryId: string,
  ): Promise<AssetRow[]> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("asset_kind", IMAGE_MAP_CANDIDATE_ASSET_KIND)
      .eq("status", "ready")
      .contains("metadata_json", { image_map_entry_id: entryId })
      .order("created_at", { ascending: false });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read current image map candidate assets", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  private async listReadyImageMapCandidateAssetsForWorkpiece(
    workspaceId: string,
    workpieceId: string,
  ): Promise<AssetRow[]> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .eq("asset_kind", IMAGE_MAP_CANDIDATE_ASSET_KIND)
      .eq("status", "ready")
      .order("created_at", { ascending: false });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read current image map candidate assets", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  private async supersedeImageMapAsset(assetId: string): Promise<void> {
    const { error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .update({ status: "superseded" })
      .eq("id", assetId);

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to supersede prior image map asset", {
        reason: error.message,
      });
    }
  }

  private async supersedeAssets(assetIds: string[], errorMessage: string): Promise<void> {
    if (assetIds.length === 0) return;
    const { error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .update({ status: "superseded" })
      .in("id", assetIds);

    if (error) {
      throw new HttpError(502, "db_write_failed", errorMessage, {
        reason: error.message,
      });
    }
  }

  private async insertImageMapAssetRow(
    row: Database["tongs"]["Tables"]["assets"]["Insert"],
  ): Promise<AssetRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .insert(row)
      .select("*")
      .single();

    if (error || !data) {
      throw new HttpError(502, "db_write_failed", "Failed to register image map asset", {
        reason: error?.message ?? "missing_asset_row",
      });
    }

    return data;
  }

  private async insertAssetRow(
    row: Database["tongs"]["Tables"]["assets"]["Insert"],
    errorMessage: string,
  ): Promise<AssetRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .insert(row)
      .select("*")
      .single();

    if (error || !data) {
      throw new HttpError(502, "db_write_failed", errorMessage, {
        reason: error?.message ?? "missing_asset_row",
      });
    }

    return data;
  }

  private async updateImageMapAssetRow(
    assetId: string,
    patch: Database["tongs"]["Tables"]["assets"]["Update"],
    errorMessage: string,
  ): Promise<AssetRow> {
    const { error } = await this.supabase
      .schema("tongs")
      .from("assets")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", assetId);

    if (error) {
      throw new HttpError(502, "db_write_failed", errorMessage, {
        reason: error.message,
      });
    }

    const { data, error: readError } = await this.supabase
      .schema("tongs")
      .from("assets")
      .select("*")
      .eq("id", assetId)
      .order("created_at", { ascending: false })
      .limit(1);

    const row = data?.[0] ?? null;
    if (readError || !row) {
      throw new HttpError(502, "db_read_failed", "Failed to reload updated image map asset", {
        reason: readError?.message ?? "missing_asset_row",
      });
    }

    return row;
  }

  private buildWorkpieceImageMapResponse(args: {
    workpieceId: string;
    workspaceId: string;
    entries: EpisodeImageMapEntryRecord[];
    metadataUpdatedAt: string | null;
    assetRow: AssetRow | null;
  }): WorkpieceImageMapResponseData {
    return {
      image_map: {
        workpiece_id: args.workpieceId,
        workspace_id: args.workspaceId,
        entries: args.entries,
        metadata_updated_at: args.metadataUpdatedAt,
      },
      asset: normalizeImageMapAssetSummary(args.assetRow),
    };
  }

  private async resolvePreferredWorkpieceScript(args: {
    cradle: EpisodeRow;
  }): Promise<{
    path: string | null;
    updatedAt: string | null;
  }> {
    const manifest = await this.loadManifestOrDefault(args.cradle);
    const candidatePaths = Array.from(new Set([
      manifest.pointers.script_primary,
      ...READY_SCRIPT_PATH_CANDIDATES,
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)));

    for (const path of candidatePaths) {
      const manifestEntry = manifest.files[path];
      if (manifestEntry) {
        return {
          path,
          updatedAt: manifestEntry.updated_at ?? null,
        };
      }
    }

    for (const path of candidatePaths) {
      const fileRow = await this.readWorkpieceFileUpdatedAt(args.cradle.id, path);
      if (fileRow) {
        return {
          path,
          updatedAt: fileRow.updated_at ?? null,
        };
      }
    }

    return {
      path: null,
      updatedAt: null,
    };
  }

  private buildWorkpieceVisualPackageResponse(args: {
    workpieceId: string;
    workspaceId: string;
    scriptPath: string | null;
    scriptUpdatedAt: string | null;
    imageMapUpdatedAt: string | null;
    imageMapAssetRow: AssetRow | null;
    entries: EpisodeImageMapEntryRecord[];
    selectedAssetRows: AssetRow[];
  }): WorkpieceVisualPackageResponseData {
    const selectedAssetById = new Map(args.selectedAssetRows.map((row) => [row.id, row] as const));
    const visuals = [...args.entries]
      .sort((left, right) => {
        if (left.beat_order !== right.beat_order) {
          return left.beat_order - right.beat_order;
        }
        if (left.paragraph_beat_order !== right.paragraph_beat_order) {
          return left.paragraph_beat_order - right.paragraph_beat_order;
        }
        return left.id.localeCompare(right.id);
      })
      .map((entry) => {
        const selectedAssetRef = entry.selected_asset_id
          ? (entry.candidate_assets.find((asset) => asset.asset_id === entry.selected_asset_id) ?? null)
          : null;
        const selectedAsset = normalizeWorkpieceVisualPackageSelectedAsset(
          entry.selected_asset_id ? (selectedAssetById.get(entry.selected_asset_id) ?? null) : null,
        );
        const visualMode = selectedAsset?.visual_mode
          ?? selectedAssetRef?.visual_mode
          ?? (entry.candidate_assets.find((asset) => asset.visual_mode)?.visual_mode ?? null);

        return {
          entry_id: entry.id,
          beat_order: entry.beat_order,
          paragraph_beat_order: entry.paragraph_beat_order,
          status: entry.status,
          script_anchor: entry.script_anchor,
          visual_mode: visualMode,
          selected_asset_id: entry.selected_asset_id,
          selected_asset: selectedAsset,
        };
      });

    return {
      workspace_id: args.workspaceId,
      workpiece_id: args.workpieceId,
      script_path: args.scriptPath,
      script_updated_at: args.scriptUpdatedAt,
      image_map_updated_at: args.imageMapUpdatedAt,
      image_map_asset_updated_at: args.imageMapAssetRow?.updated_at ?? null,
      visuals,
    };
  }

  async listHearthWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HearthWorkpiecePresenceRow[]> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const activeCutoffIso = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("hearth_workpiece_presence")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .gt("last_seen_at", activeCutoffIso)
      .order("last_seen_at", { ascending: false });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list Hearth workpiece presence", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  async upsertHearthWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    input: UpsertHearthWorkpiecePresenceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HearthWorkpiecePresenceRow> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    const auth = await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("hearth_workpiece_presence")
      .upsert({
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        user_id: auth.userId,
        display_name: typeof input.display_name === "string" ? input.display_name : null,
        mode: input.mode,
        last_seen_at: nowIso,
      }, { onConflict: "workspace_id,workpiece_id,user_id" })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert Hearth workpiece presence", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "hearth_workpiece_presence upsert returned no row");
    }

    return data;
  }

  async readHammerWorkpieceState(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerPersistenceSnapshot> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const { data: state, error } = await this.supabase
      .schema("tongs")
      .from("hammer_workpiece_state")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .maybeSingle();

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to read Hammer workpiece state", {
        reason: error.message,
      });
    }

    const readArtifact = async (path: string | null): Promise<HammerPersistedArtifactRecord> => {
      if (!path) {
        return {
          path: null,
          file_updated_at: null,
          data: null,
        };
      }

      const result = await this.readWorkpieceJson(workpieceId, path);
      if (!result.found) {
        return {
          path,
          file_updated_at: null,
          data: null,
        };
      }

      return {
        path,
        file_updated_at: result.file_row?.updated_at ?? null,
        data: result.data ?? null,
      };
    };

    return {
      schema_version: 1,
      state: state ?? null,
      editor_session: await readArtifact(state?.editor_session_path ?? null),
      structured_transcript: await readArtifact(state?.transcript_artifact_path ?? null),
      speaker_map: await readArtifact(state?.speaker_map_artifact_path ?? null),
      visual_placements: await readArtifact(state?.visual_placement_artifact_path ?? null),
      audio_polish: await readArtifact(state?.audio_polish_artifact_path ?? null),
      edit_plan: await readArtifact(state?.edit_plan_artifact_path ?? null),
      macro_hooks: {
        recipe_ref: state?.macro_recipe_ref ?? null,
        last_run_ref: state?.last_macro_run_ref ?? null,
      },
    };
  }

  async saveHammerWorkpieceState(
    workspaceId: string,
    workpieceId: string,
    input: SaveHammerWorkpieceStateRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerPersistenceSnapshot> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    const auth = await this.assertWorkspaceRoleFromAccessToken(workspaceId, "editor", options?.userAccessToken);

    const { data: existingState, error: existingStateError } = await this.supabase
      .schema("tongs")
      .from("hammer_workpiece_state")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .maybeSingle();

    if (existingStateError) {
      throw new HttpError(502, "db_read_failed", "Failed to read existing Hammer workpiece state", {
        reason: existingStateError.message,
      });
    }

    const commitArtifact = async (
      key: HammerArtifactKey,
      request: HammerArtifactWriteRequest | undefined,
      pointer?: ManifestPointerKey,
    ): Promise<string | undefined> => {
      if (!request) return undefined;

      const path = request.path ?? HAMMER_ARTIFACT_PATHS[key];
      await this.commitFile(workpieceId, {
        path,
        content_type: "application/json",
        written_by: input.written_by,
        ...(pointer ? { pointer } : {}),
        ...(request.expected_previous_updated_at
          ? { expected_previous_updated_at: request.expected_previous_updated_at }
          : {}),
        event_name: HAMMER_ARTIFACT_EVENT_NAMES[key],
        event_payload: {
          schema_version: 1,
          artifact: key,
          workspace_id: workspaceId,
          workpiece_id: workpieceId,
        } as Json,
        json: request.data,
        user_access_token: options?.userAccessToken ?? null,
      });
      return path;
    };

    const editorSessionPath = await commitArtifact("editor_session", input.editor_session, "session_current");
    const transcriptArtifactPath = await commitArtifact("structured_transcript", input.structured_transcript);
    const speakerMapArtifactPath = await commitArtifact("speaker_map", input.speaker_map);
    const visualPlacementArtifactPath = await commitArtifact("visual_placements", input.visual_placements);
    const audioPolishArtifactPath = await commitArtifact("audio_polish", input.audio_polish);
    const editPlanArtifactPath = await commitArtifact("edit_plan", input.edit_plan, "edit_current");

    const nextState: Database["tongs"]["Tables"]["hammer_workpiece_state"]["Insert"] = {
      workspace_id: workspaceId,
      workpiece_id: workpieceId,
      active_session_id: typeof input.active_session_id === "undefined"
        ? existingState?.active_session_id ?? null
        : input.active_session_id,
      editor_session_path: typeof editorSessionPath === "undefined"
        ? existingState?.editor_session_path ?? null
        : editorSessionPath,
      transcript_artifact_path: typeof transcriptArtifactPath === "undefined"
        ? existingState?.transcript_artifact_path ?? null
        : transcriptArtifactPath,
      speaker_map_artifact_path: typeof speakerMapArtifactPath === "undefined"
        ? existingState?.speaker_map_artifact_path ?? null
        : speakerMapArtifactPath,
      visual_placement_artifact_path: typeof visualPlacementArtifactPath === "undefined"
        ? existingState?.visual_placement_artifact_path ?? null
        : visualPlacementArtifactPath,
      audio_polish_artifact_path: typeof audioPolishArtifactPath === "undefined"
        ? existingState?.audio_polish_artifact_path ?? null
        : audioPolishArtifactPath,
      edit_plan_artifact_path: typeof editPlanArtifactPath === "undefined"
        ? existingState?.edit_plan_artifact_path ?? null
        : editPlanArtifactPath,
      edit_plan_signature: typeof input.edit_plan_signature === "undefined"
        ? existingState?.edit_plan_signature ?? null
        : input.edit_plan_signature,
      prep_status: input.prep_status ?? existingState?.prep_status ?? "idle",
      alignment_status: input.alignment_status ?? existingState?.alignment_status ?? "not_started",
      macro_recipe_ref: typeof input.macro_recipe_ref === "undefined"
        ? existingState?.macro_recipe_ref ?? null
        : input.macro_recipe_ref,
      last_macro_run_ref: typeof input.last_macro_run_ref === "undefined"
        ? existingState?.last_macro_run_ref ?? null
        : input.last_macro_run_ref,
      last_opened_at: input.last_opened_at ?? existingState?.last_opened_at ?? new Date().toISOString(),
      updated_by: auth.userId,
    };

    const { error: upsertError } = await this.supabase
      .schema("tongs")
      .from("hammer_workpiece_state")
      .upsert(nextState, { onConflict: "workspace_id,workpiece_id" });

    if (upsertError) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert Hammer workpiece state", {
        reason: upsertError.message,
      });
    }

    return this.readHammerWorkpieceState(workspaceId, workpieceId, options);
  }

  async listHammerWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerWorkpiecePresenceRow[]> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const activeCutoffIso = new Date(Date.now() - 60_000).toISOString();
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("hammer_workpiece_presence")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("workpiece_id", workpieceId)
      .gt("last_seen_at", activeCutoffIso)
      .order("last_seen_at", { ascending: false });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list Hammer workpiece presence", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  async upsertHammerWorkpiecePresence(
    workspaceId: string,
    workpieceId: string,
    input: UpsertHammerWorkpiecePresenceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<HammerWorkpiecePresenceRow> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertWorkpieceInWorkspace(workpieceId, workspaceId);
    const auth = await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("hammer_workpiece_presence")
      .upsert({
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        user_id: auth.userId,
        session_id: typeof input.session_id === "string" ? input.session_id : null,
        display_name: typeof input.display_name === "string" ? input.display_name : null,
        mode: input.mode,
        last_seen_at: nowIso,
      }, { onConflict: "workspace_id,workpiece_id,user_id" })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert Hammer workpiece presence", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "hammer_workpiece_presence upsert returned no row");
    }

    return data;
  }

  async listCalendarEventAssignmentsForEvent(
    workspaceId: string,
    calendarEventId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<CalendarEventAssignmentRow[]> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertCalendarEventWorkspace(calendarEventId, workspaceId);
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("calendar_event_assignments")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("event_id", calendarEventId)
      .order("created_at", { ascending: true })
      .order("assignment_id", { ascending: true });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list calendar event assignments", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  async attachCalendarEventAssignment(
    workspaceId: string,
    calendarEventId: string,
    input: AttachCalendarEventAssignmentRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<CalendarEventAssignmentRow> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertCalendarEventWorkspace(calendarEventId, workspaceId);
    const auth = await this.assertWorkspaceRoleFromAccessToken(workspaceId, "editor", options?.userAccessToken);
    const episode = await this.getCradleOrThrow(input.assignment_id);
    if (episode.workspace_id !== workspaceId) {
      throw new HttpError(400, "workspace_mismatch", "assignment_id must belong to the same workspace");
    }

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("calendar_event_assignments")
      .upsert(
        {
          workspace_id: workspaceId,
          event_id: calendarEventId,
          assignment_id: input.assignment_id,
          created_by: auth.userId,
        },
        { onConflict: "event_id,assignment_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to attach episode to calendar event", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "calendar_event_assignments upsert returned no row");
    }

    return data;
  }

  async detachCalendarEventAssignment(
    workspaceId: string,
    calendarEventId: string,
    assignmentId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<{ detached: boolean }> {
    await this.getWorkspaceOrThrow(workspaceId);
    await this.assertCalendarEventWorkspace(calendarEventId, workspaceId);
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "editor", options?.userAccessToken);

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("calendar_event_assignments")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("event_id", calendarEventId)
      .eq("assignment_id", assignmentId)
      .select("assignment_id");

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to detach episode from calendar event", {
        reason: error.message,
      });
    }

    return {
      detached: (data ?? []).length > 0,
    };
  }

  private async applyAiTokenDelta(args: {
    userId: string;
    spent: number;
    requestId: string;
    providerRequestId: string | null;
    reason: string;
  }): Promise<{ tokenBalance: number | null } | { warning: string }> {
    const rpcClient = this.supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        params: {
          p_user_id: string;
          p_delta: number;
          p_reason: string;
          p_request_id: string;
          p_provider_request_id?: string;
        },
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    };

    const { data, error } = await rpcClient.rpc("apply_ai_token_delta", {
      p_user_id: args.userId,
      p_delta: -Math.max(0, Math.ceil(args.spent)),
      p_reason: args.reason,
      p_request_id: args.requestId,
      p_provider_request_id: args.providerRequestId ?? undefined,
    });

    if (error) {
      return { warning: "Unable to update credits." };
    }

    const row = Array.isArray(data) ? data[0] : data;
    const tokenBalance = (
      row
      && typeof row === "object"
      && typeof (row as Record<string, unknown>).token_balance === "number"
    )
      ? ((row as Record<string, unknown>).token_balance as number)
      : null;

    return { tokenBalance };
  }

  private async upsertWorkpieceFile(rows: Database["tongs"]["Tables"]["workpiece_files"]["Insert"][]): Promise<void> {
    const { error } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .upsert(rows, { onConflict: "workpiece_id,path" });

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to upsert workpiece_files", {
        reason: error.message,
      });
    }
  }

  private async insertEvent(input: {
    workpieceId: string;
    eventName: string;
    payload: Json;
    writtenBy: WrittenBy;
    correlationId: string | null;
  }): Promise<WorkpieceEventRow> {
    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workpiece_events")
      .insert({
        workpiece_id: input.workpieceId,
        event_name: input.eventName,
        payload: input.payload,
        correlation_id: input.correlationId,
        written_by_tool: input.writtenBy.tool,
        written_by_tool_version: input.writtenBy.tool_version,
        written_by_lane: input.writtenBy.lane,
      })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to append workpiece event", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "workpiece_events insert returned no row");
    }

    return data;
  }

  private async loadManifestOrDefault(cradle: EpisodeRow): Promise<WorkpieceManifest> {
    const status = "draft";
    const createdAt = cradle.created_at ?? new Date().toISOString();
    const key = buildStorageKey(cradle.id, MANIFEST_PATH);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, key);
    const fallback = {
      workpieceId: cradle.id,
      workspaceId: cradle.workspace_id,
      status,
      createdAt,
    };

    if (!bytes) {
      return defaultManifest(cradle.id, cradle.workspace_id, status, createdAt);
    }

    const parsed = parseJsonText(textDecoder.decode(bytes), MANIFEST_PATH);
    return normalizeLoadedManifest(parsed, fallback);
  }

  async createCradle(input: CreateCradleRequest): Promise<CreateCradleResponse> {
    const nowIso = new Date().toISOString();
    const writtenBy = input.written_by ?? DEFAULT_WRITTEN_BY;
    const status = input.status?.trim() || "draft";

    const { data: episode, error: episodeError } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .insert({
        ...(input.cradle_id ? { id: input.cradle_id } : {}),
        workspace_id: input.workspace_id,
        label: resolveEpisodeLabel(input.metadata),
      })
      .select("*")
      .single();

    if (episodeError) {
      throw new HttpError(502, "db_write_failed", "Failed to create episode", {
        reason: episodeError.message,
      });
    }
    if (!episode) {
      throw new HttpError(502, "db_write_failed", "episodes insert returned no row");
    }

    const cradle = episode;

    const metadataDocument = {
      schema: "forge.metadata.v1",
      workpiece_id: cradle.id,
      workspace_id: cradle.workspace_id,
      created_at: nowIso,
      updated_at: nowIso,
      status,
      notes: null,
      origin: null,
      content_category: null,
      episode: {
        schema: "forge.episode.package.v2",
        seo: {
          titles: [] as JsonValue[],
          tags: [] as JsonValue[],
          description_short: null,
          description_long: null,
        },
        thumbnail: {
          concepts: [] as JsonValue[],
          versions: [] as JsonValue[],
          primary_version_id: null,
        },
        launch_variants: [] as JsonValue[],
        image_map: {
          entries: [] as JsonValue[],
        },
      },
      seo_titles: [] as JsonValue[],
      tags: [] as JsonValue[],
      description_short: null,
      description_long: null,
      thumbnail_concepts: [] as JsonValue[],
      thumbnail_versions: [] as JsonValue[],
      primary_thumbnail_version_id: null,
      launch_variants: [] as JsonValue[],
      image_map_entries: [] as JsonValue[],
      image_beat_sheet: {
        entries: [] as JsonValue[],
      },
    };

    const assetsRegistryDocument = {
      schema: "forge.assets.v1",
      workpiece_id: cradle.id,
      updated_at: nowIso,
      assets: [] as JsonValue[],
    };

    const metadataBytes = canonicalJsonBytes(metadataDocument);
    const metadataHash = await sha256Hex(metadataBytes);
    const assetsBytes = canonicalJsonBytes(assetsRegistryDocument);
    const assetsHash = await sha256Hex(assetsBytes);

    const manifest = defaultManifest(cradle.id, cradle.workspace_id, status, nowIso);
    manifest.origin = {
      created_by: {
        user_id: input.created_by?.user_id ?? null,
        display_name: input.created_by?.display_name ?? null,
      },
      tool: {
        name: input.origin_tool?.name ?? DEFAULT_ORIGIN_TOOL.name,
        version: input.origin_tool?.version ?? DEFAULT_ORIGIN_TOOL.version,
      },
    };
    manifest.files["metadata.json"] = buildManifestFileEntry(
      "metadata",
      "application/json",
      metadataBytes.length,
      metadataHash,
      writtenBy,
      nowIso,
    );
    manifest.files["assets/assets.json"] = buildManifestFileEntry(
      "assets_registry",
      "application/json",
      assetsBytes.length,
      assetsHash,
      writtenBy,
      nowIso,
    );

    const finalized = await finalizeManifestTwoPass(manifest, writtenBy, nowIso);

    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, "metadata.json"),
      metadataBytes,
      "application/json",
    );
    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, "assets/assets.json"),
      assetsBytes,
      "application/json",
    );
    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(cradle.id, MANIFEST_PATH),
      finalized.manifestBytes,
      "application/json",
    );

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path: "metadata.json",
        file_type: "metadata",
        content_type: "application/json",
        bytes: metadataBytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: metadataHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, "metadata.json"),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
      {
        workpiece_id: cradle.id,
        path: "assets/assets.json",
        file_type: "assets_registry",
        content_type: "application/json",
        bytes: assetsBytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: assetsHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, "assets/assets.json"),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
      {
        workpiece_id: cradle.id,
        path: MANIFEST_PATH,
        file_type: "manifest",
        content_type: "application/json",
        bytes: finalized.finalBytes,
        hash_algo: SHA256_ALGO,
        hash_value: finalized.finalHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(cradle.id, MANIFEST_PATH),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    const createdEvent = await this.insertEvent({
      workpieceId: cradle.id,
      eventName: "workpiece.created",
      payload: {
        workspace_id: cradle.workspace_id,
        status,
        baseline_files: ["metadata.json", "assets/assets.json", MANIFEST_PATH],
      } as Json,
      writtenBy,
      correlationId: normalizeCorrelationId(input.correlation_id),
    });

    return {
      cradle,
      manifest_hash: finalized.finalHash,
      manifest_bytes: finalized.finalBytes,
      files_indexed: 3,
      event: createdEvent,
    };
  }

  async commitFile(workpieceId: string, input: CommitFileRequest): Promise<CommitFileResponse> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    const path = normalizeRelativePath(input.path);
    let readyScriptActor: { userId: string; role: WorkspaceRole } | null = null;
    if (path === MANIFEST_PATH) {
      throw new HttpError(400, "invalid_path", "manifest.json is managed by Tongs and cannot be committed directly");
    }
    if (READY_SCRIPT_PATH_SET.has(path)) {
      readyScriptActor = await this.assertWorkspaceRoleFromAccessToken(
        cradle.workspace_id,
        "editor",
        input.user_access_token,
      );
    }
    if (input.expected_previous_updated_at) {
      const { data: existingFile, error: existingFileError } = await this.supabase
        .schema("tongs")
        .from("workpiece_files")
        .select("updated_at")
        .eq("workpiece_id", cradle.id)
        .eq("path", path)
        .maybeSingle();

      if (existingFileError) {
        throw new HttpError(502, "db_read_failed", "Failed to read existing file metadata for conflict check", {
          reason: existingFileError.message,
        });
      }

      const expectedUpdatedAt = new Date(input.expected_previous_updated_at).toISOString();
      const currentUpdatedAt = existingFile?.updated_at ? new Date(existingFile.updated_at).toISOString() : null;
      if (currentUpdatedAt !== expectedUpdatedAt) {
        throw new HttpError(409, "file_conflict", "File changed since last load", {
          path,
          expected_previous_updated_at: expectedUpdatedAt,
          current_updated_at: currentUpdatedAt,
        });
      }
    }

    const nowIso = new Date().toISOString();
    const contentType = normalizeContentType(input.content_type, path);
    const fileType = (typeof input.file_type === "string" && input.file_type.trim()) || inferFileType(path, contentType);
    const writtenBy = normalizeWrittenBy(input.written_by);
    const storageKey = buildStorageKey(workpieceId, path);

    let bytes: Uint8Array;
    let commitMode: "replace" | "append_jsonl" = "replace";

    if (typeof input.jsonl_append !== "undefined" && isJsonlFile(path, contentType)) {
      commitMode = "append_jsonl";
      const existing = await downloadStorageObject(this.supabase, this.bucket, storageKey);
      const lineBytes = canonicalizeJsonlLine(input.jsonl_append);
      if (!existing || existing.length === 0) {
        bytes = lineBytes;
      } else if (existing[existing.length - 1] === 0x0a) {
        bytes = concatBytes([existing, lineBytes]);
      } else {
        bytes = concatBytes([existing, textEncoder.encode("\n"), lineBytes]);
      }
    } else {
      bytes = canonicalizeReplaceBytes(path, contentType, input);
    }

    const hash = await sha256Hex(bytes);
    await uploadStorageObject(this.supabase, this.bucket, storageKey, bytes, contentType);

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path,
        file_type: fileType,
        content_type: contentType,
        bytes: bytes.length,
        hash_algo: SHA256_ALGO,
        hash_value: hash,
        storage_bucket: this.bucket,
        storage_key: storageKey,
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    const manifest = await this.loadManifestOrDefault(cradle);
    manifest.updated_at = nowIso;
    if (!manifest.status) {
      manifest.status = "draft";
    }
    manifest.files[path] = buildManifestFileEntry(fileType, contentType, bytes.length, hash, writtenBy, nowIso);
    applyPointerUpdates(manifest, path, input.pointer);

    const finalized = await finalizeManifestTwoPass(manifest, writtenBy, nowIso);

    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(workpieceId, MANIFEST_PATH),
      finalized.manifestBytes,
      "application/json",
    );

    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path: MANIFEST_PATH,
        file_type: "manifest",
        content_type: "application/json",
        bytes: finalized.finalBytes,
        hash_algo: SHA256_ALGO,
        hash_value: finalized.finalHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(workpieceId, MANIFEST_PATH),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    if (readyScriptActor) {
      await this.upsertReadyScriptMeta(
        cradle.workspace_id,
        cradle.id,
        path,
        readyScriptActor.userId,
      );
    }

    const eventName = input.event_name?.trim() || "workpiece.file.committed";
    const eventPayload =
      typeof input.event_payload === "undefined"
        ? ({
            path,
            content_type: contentType,
            bytes: bytes.length,
            hash,
            mode: commitMode,
          } as Json)
        : input.event_payload;

    const event = await this.insertEvent({
      workpieceId,
      eventName,
      payload: eventPayload,
      writtenBy,
      correlationId: normalizeCorrelationId(input.correlation_id),
    });

    const { data: fileRow, error: fileRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", cradle.id)
      .eq("path", path)
      .single();

    if (fileRowError || !fileRow) {
      throw new HttpError(502, "db_read_failed", "Failed to read committed workpiece_files row", {
        reason: fileRowError?.message,
      });
    }

    const { data: manifestRow, error: manifestRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", cradle.id)
      .eq("path", MANIFEST_PATH)
      .single();

    if (manifestRowError || !manifestRow) {
      throw new HttpError(502, "db_read_failed", "Failed to read manifest workpiece_files row", {
        reason: manifestRowError?.message,
      });
    }

    return {
      workpiece_id: cradle.id,
      path,
      storage_key: storageKey,
      hash,
      bytes: bytes.length,
      content_type: contentType,
      manifest_hash: finalized.finalHash,
      manifest_bytes: finalized.finalBytes,
      file_row: fileRow,
      manifest_row: manifestRow,
      event,
    };
  }

  async commitWorkspaceFile(workspaceId: string, input: CommitFileRequest): Promise<CommitWorkspaceFileResponse> {
    const workspace = await this.getWorkspaceOrThrow(workspaceId);
    const path = normalizeRelativePath(input.path);
    if (extensionOf(path) !== ".json") {
      throw new HttpError(400, "invalid_path", "Workspace commit-file currently supports JSON paths only");
    }

    const contentType = normalizeContentType(input.content_type, path);
    normalizeWrittenBy(input.written_by);
    if (typeof input.jsonl_append !== "undefined") {
      throw new HttpError(400, "invalid_payload", "workspace commit-file does not support jsonl_append");
    }

    const storageKey = resolveWorkspaceCloudWriteTarget({
      workspaceId,
      legacyOwnerUserId: workspace.created_by,
    }, path).key;
    const bytes = canonicalizeReplaceBytes(path, contentType, input);
    const hash = await sha256Hex(bytes);

    await uploadStorageObject(this.supabase, this.bucket, storageKey, bytes, contentType);

    return {
      workspace_id: workspaceId,
      path,
      storage_key: storageKey,
      hash,
      bytes: bytes.length,
      content_type: contentType,
    };
  }

  async deleteReadyScript(
    workpieceId: string,
    path: string,
    options?: DeleteReadyScriptOptions,
  ): Promise<DeleteReadyScriptResult> {
    const normalizedPath = normalizeRelativePath(path);
    if (!READY_SCRIPT_PATH_SET.has(normalizedPath)) {
      throw new HttpError(400, "invalid_path", "Only ready script paths can be deleted from this endpoint");
    }
    const cradle = await this.getCradleOrThrow(workpieceId);
    await this.assertWorkspaceRoleFromAccessToken(cradle.workspace_id, "editor", options?.userAccessToken);

    const warnings: string[] = [];

    const { data: fileRow, error: fileRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("*")
      .eq("workpiece_id", workpieceId)
      .eq("path", normalizedPath)
      .maybeSingle();

    if (fileRowError) {
      throw new HttpError(502, "db_read_failed", "Failed to read ready script file row", {
        reason: fileRowError.message,
      });
    }
    if (!fileRow) {
      const removedSessionItemCount = await this.removeRecordingSessionItemsForScript(workpieceId, normalizedPath);
      const readyMetaDeleted = await this.deleteReadyScriptMeta(cradle.workspace_id, workpieceId, normalizedPath);
      return {
        workpiece_id: workpieceId,
        path: normalizedPath,
        deleted: true,
        already_deleted: true,
        removed_session_item_count: removedSessionItemCount,
        ready_meta_deleted: readyMetaDeleted,
        warnings,
      };
    }

    const { error: deleteFileError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .delete()
      .eq("workpiece_id", workpieceId)
      .eq("path", normalizedPath);

    if (deleteFileError) {
      throw new HttpError(502, "db_write_failed", "Failed to delete ready script file row", {
        reason: deleteFileError.message,
      });
    }

    const removedSessionItemCount = await this.removeRecordingSessionItemsForScript(workpieceId, normalizedPath);
    const readyMetaDeleted = await this.deleteReadyScriptMeta(cradle.workspace_id, workpieceId, normalizedPath);

    const nowIso = new Date().toISOString();
    const writtenBy = DEFAULT_WRITTEN_BY;
    const manifest = await this.loadManifestOrDefault(cradle);
    manifest.updated_at = nowIso;
    delete manifest.files[normalizedPath];
    for (const pointerKey of Object.keys(manifest.pointers) as ManifestPointerKey[]) {
      if (manifest.pointers[pointerKey] === normalizedPath) {
        manifest.pointers[pointerKey] = null;
      }
    }

    const finalized = await finalizeManifestTwoPass(manifest, writtenBy, nowIso);
    await uploadStorageObject(
      this.supabase,
      this.bucket,
      buildStorageKey(workpieceId, MANIFEST_PATH),
      finalized.manifestBytes,
      "application/json",
    );
    await this.upsertWorkpieceFile([
      {
        workpiece_id: cradle.id,
        path: MANIFEST_PATH,
        file_type: "manifest",
        content_type: "application/json",
        bytes: finalized.finalBytes,
        hash_algo: SHA256_ALGO,
        hash_value: finalized.finalHash,
        storage_bucket: this.bucket,
        storage_key: buildStorageKey(workpieceId, MANIFEST_PATH),
        written_by_tool: writtenBy.tool,
        written_by_tool_version: writtenBy.tool_version,
        written_by_lane: writtenBy.lane,
      },
    ]);

    await this.insertEvent({
      workpieceId,
      eventName: "workpiece.file.deleted",
      payload: {
        path: normalizedPath,
        file_type: fileRow.file_type ?? null,
        removed_session_item_count: removedSessionItemCount,
        ready_meta_deleted: readyMetaDeleted,
        already_deleted: false,
      } as Json,
      writtenBy,
      correlationId: null,
    });

    const storageBucket = fileRow.storage_bucket?.trim() || this.bucket;
    const storageKey = fileRow.storage_key?.trim() || buildStorageKey(workpieceId, normalizedPath);
    const { error: storageDeleteError } = await this.supabase.storage
      .from(storageBucket)
      .remove([storageKey]);
    if (storageDeleteError) {
      logStorageError("delete", storageBucket, storageKey, storageDeleteError);
      warnings.push("storage_delete_failed");
    }

    return {
      workpiece_id: workpieceId,
      path: normalizedPath,
      deleted: true,
      already_deleted: false,
      removed_session_item_count: removedSessionItemCount,
      ready_meta_deleted: readyMetaDeleted,
      warnings,
    };
  }

  async generateEpisodeThumbnail(
    workpieceId: string,
    input: GenerateEpisodeThumbnailRequest,
  ): Promise<GenerateEpisodeThumbnailResponse> {
    if (!this.imageProvider) {
      throw new HttpError(503, "thumbnail_provider_unavailable", "Image provider is not configured");
    }

    const workspace = await this.getWorkspaceOrThrow(input.workspace_id);
    const episode = await this.getCradleOrThrow(workpieceId);
    if (episode.id !== input.episode_id) {
      throw new HttpError(400, "episode_mismatch", "episode_id must match workpiece path id");
    }
    if (episode.workspace_id !== workspace.id) {
      throw new HttpError(400, "workspace_mismatch", "Episode does not belong to workspace_id");
    }

    const lane = input.lane ?? "forge";
    const requiresConfirm = lane === "forge"
      && !input.always_approve_ai_spend
      && !input.confirm_spend;
    if (requiresConfirm) {
      throw new HttpError(409, "confirmation_required", "Generating a thumbnail spends AI credits", {
        requires_confirmation: true,
      });
    }

    const userId = await this.resolveUserIdFromAccessToken(input.user_access_token);
    if (!userId) {
      throw new HttpError(401, "authentication_required", "User access token is required for thumbnail generation");
    }

    const metadataRead = await this.readWorkpieceJson(workpieceId, "metadata.json");
    const metadataRaw = (
      metadataRead.found
      && metadataRead.data
      && typeof metadataRead.data === "object"
      && !Array.isArray(metadataRead.data)
    )
      ? (metadataRead.data as Record<string, unknown>)
      : null;
    const metadata = ensureMetadataBase({
      metadata: metadataRaw,
      workpieceId,
      workspaceId: workspace.id,
    });
    const episodePackage = normalizeEpisodePackageRecord(metadata);

    const conceptById = new Map(episodePackage.thumbnail.concepts.map((concept) => [concept.id, concept]));
    const requestedConcept = input.concept_id ? conceptById.get(input.concept_id) ?? null : null;
    if (input.concept_id && !requestedConcept && !input.prompt) {
      throw new HttpError(404, "concept_not_found", `Thumbnail concept ${input.concept_id} was not found`);
    }

    const conceptId = requestedConcept?.id ?? input.concept_id ?? randomId("concept");
    const conceptLabel = requestedConcept?.label ?? "Generated Concept";
    const conceptPrompt = (input.prompt?.trim() || requestedConcept?.prompt_text || "").trim();
    if (!conceptPrompt) {
      throw new HttpError(400, "missing_prompt", "Unable to resolve prompt for thumbnail generation");
    }
    const stylePreset = normalizeHearthVisualStyle(input.preset ?? requestedConcept?.style_preset ?? null);

    if (requestedConcept) {
      requestedConcept.style_preset = stylePreset;
    }

    if (!conceptById.has(conceptId)) {
      episodePackage.thumbnail.concepts.push({
        id: conceptId,
        label: conceptLabel,
        prompt_text: conceptPrompt,
        style_preset: stylePreset,
      });
    }

    const finalPrompt = [
      conceptPrompt,
      ...buildHearthVisualStylePromptLines(stylePreset),
      THUMBNAIL_EDITORIAL_BASE_HINT,
    ].filter(Boolean).join("\n\n");

    const imageResult = await this.imageProvider.generateImage({
      prompt: finalPrompt,
      aspect: input.aspect ?? "16:9",
      size: input.size ?? null,
    } as GenerateImageInput);

    const requestId = randomUuid();
    const versionId = randomUuid();
    const assetId = randomUuid();
    const createdAt = new Date().toISOString();
    const extension = imageResult.mimeType.toLowerCase().includes("jpeg") ? "jpg" : "png";
    const assetPath = `${THUMBNAIL_ASSET_PREFIX}/${workpieceId}/${versionId}.${extension}`;
    const bytes = parseBase64ByteLength(imageResult.bytesBase64);

    const writtenBy: WrittenBy = {
      tool: "hearth",
      tool_version: "0.0.0",
      lane: "forge-managed",
    };

    const assetCommit = await this.commitFile(workpieceId, {
      path: assetPath,
      content_type: imageResult.mimeType,
      file_type: "thumbnail_image",
      bytes_base64: imageResult.bytesBase64,
      written_by: writtenBy,
      event_name: "hearth.thumbnail.asset.generated.v1",
      event_payload: {
        request_id: requestId,
        provider: imageResult.provider,
        provider_request_id: imageResult.providerRequestId,
        concept_id: conceptId,
      } as Json,
      correlation_id: requestId,
    });

    const assetRow = await this.insertAssetRow({
      id: assetId,
      workspace_id: workspace.id,
      workpiece_id: workpieceId,
      path: assetPath,
      mime_type: imageResult.mimeType,
      bytes,
      storage_bucket: assetCommit.file_row.storage_bucket,
      storage_key: assetCommit.storage_key,
      provider: imageResult.provider,
      provider_request_id: imageResult.providerRequestId,
      request_id: requestId,
      prompt: finalPrompt,
      created_by: userId,
      asset_kind: THUMBNAIL_ASSET_KIND,
      status: "ready",
      metadata_json: buildThumbnailAssetMetadata({
        conceptId,
        conceptLabel,
        conceptPrompt,
        stylePreset,
        aspect: input.aspect ?? "16:9",
        size: input.size ?? null,
        finalPrompt,
        revisedPrompt: imageResult.revisedPrompt ?? null,
      }),
      supersedes_asset_id: null,
    }, "Failed to register generated thumbnail asset");

    const version: ThumbnailVersionRecord = {
      id: versionId,
      concept_id: conceptId,
      created_at: createdAt,
      provider: imageResult.provider,
      prompt: finalPrompt,
      provider_request_id: imageResult.providerRequestId,
      asset_id: assetId,
      asset_path: assetPath,
      mime_type: imageResult.mimeType,
      status: "ready",
      error: null,
    };

    const nextVersions = [...episodePackage.thumbnail.versions, version];
    episodePackage.thumbnail.versions = nextVersions;
    if (!episodePackage.thumbnail.primary_version_id) {
      episodePackage.thumbnail.primary_version_id = version.id;
    }

    const nextMetadata = mirrorEpisodePackageToMetadata(
      {
        ...metadata,
        updated_at: createdAt,
      },
      episodePackage,
    );

    await this.commitFile(workpieceId, {
      path: "metadata.json",
      content_type: "application/json",
      json: nextMetadata,
      written_by: writtenBy,
      event_name: "hearth.thumbnail.version.generated.v1",
      event_payload: {
        request_id: requestId,
        provider_request_id: imageResult.providerRequestId,
        version_id: versionId,
        concept_id: conceptId,
        asset_id: assetId,
      } as Json,
      correlation_id: requestId,
    });

    let creditsWarning: string | undefined;
    let tokenBalance: number | null | undefined;
    if (lane === "forge") {
      const spent = estimateImageTokenSpend(finalPrompt, imageResult.tokensUsed);
      const deltaResult = await this.applyAiTokenDelta({
        userId,
        spent,
        requestId,
        providerRequestId: imageResult.providerRequestId,
        reason: "hearth:thumbnail_generate",
      });
      if ("warning" in deltaResult) {
        creditsWarning = deltaResult.warning;
      } else {
        tokenBalance = deltaResult.tokenBalance;
      }
    }

    return {
      version,
      asset: {
        id: assetRow.id,
        workspace_id: assetRow.workspace_id,
        episode_id: assetRow.workpiece_id,
        path: assetRow.path,
        storage_bucket: assetRow.storage_bucket,
        storage_key: assetRow.storage_key,
        mime_type: assetRow.mime_type,
        bytes: assetRow.bytes,
        provider: assetRow.provider,
        provider_request_id: assetRow.provider_request_id,
        request_id: assetRow.request_id ?? requestId,
      },
      updated_episode_package: episodePackage,
      primary_version_id: episodePackage.thumbnail.primary_version_id,
      ...(creditsWarning ? { credits_warning: creditsWarning } : {}),
      ...(typeof tokenBalance === "number" ? { token_balance: tokenBalance } : {}),
    };
  }

  async createRecordingSessionRecord(input: CreateRecordingSessionRecordRequest): Promise<RecordingSessionRow> {
    const workspace = await this.getWorkspaceOrThrow(input.workspace_id);
    const createdBy = await this.resolveRecordingSessionCreator(workspace);
    const title = input.title?.trim() || "Recording Session";
    const calendarEventId = typeof input.calendar_event_id === "undefined" ? null : input.calendar_event_id;

    if (calendarEventId) {
      await this.assertCalendarEventWorkspace(calendarEventId, input.workspace_id);
    }

    const rpcClient = this.supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        params: {
          p_workspace_id: string;
          p_title: string;
          p_created_by: string;
          p_calendar_event_id: string | null;
        },
      ) => Promise<{
        data: RecordingSessionRow | RecordingSessionRow[] | null;
        error: { message: string } | null;
      }>;
    };

    const { data, error } = await rpcClient.rpc("create_recording_session", {
      p_workspace_id: input.workspace_id,
      p_title: title,
      p_created_by: createdBy,
      p_calendar_event_id: calendarEventId,
    });

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to create recording session", {
        reason: error.message,
      });
    }

    const row = Array.isArray(data) ? (data[0] ?? null) : data;
    if (!row) {
      throw new HttpError(502, "db_write_failed", "create_recording_session returned no row");
    }

    return row;
  }

  async listRecordingSessionsForPlanner(options?: RecordingSessionListOptions): Promise<RecordingSessionRow[]> {
    if (options?.workspace_id) {
      await this.getWorkspaceOrThrow(options.workspace_id);
    }

    let query = this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .select("*");

    if (options?.workspace_id) {
      query = query.eq("workspace_id", options.workspace_id);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list recording sessions", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  async getRecordingSessionRecord(sessionId: string): Promise<RecordingSessionRecord> {
    const session = await this.getRecordingSessionOrThrow(sessionId);
    const items = await this.listRecordingSessionItems(sessionId);
    return toRecordingSessionDTO(session, items);
  }

  async replaceRecordingSessionItems(
    sessionId: string,
    input: ReplaceRecordingSessionItemsRequest,
  ): Promise<RecordingSessionItemDTO[]> {
    await this.getRecordingSessionOrThrow(sessionId);

    const rpcClient = this.supabase.schema("tongs") as unknown as {
      rpc: (
        fn: string,
        params: {
          p_session_id: string;
          p_items: Json;
        },
      ) => Promise<{
        data: RecordingSessionItemRow[] | RecordingSessionItemRow | null;
        error: { message: string; code?: string } | null;
      }>;
    };

    const payload = input.items.map((item) => ({
      episode_id: item.episode_id,
      script_path: item.script_path,
    })) as unknown as Json;

    const { data, error } = await rpcClient.rpc("replace_recording_session_items", {
      p_session_id: sessionId,
      p_items: payload,
    });

    if (error) {
      if (error.code === "P0002") {
        throw new HttpError(404, "recording_session_not_found", `Recording session ${sessionId} was not found`);
      }
      throw new HttpError(502, "db_write_failed", "Failed to replace recording session items", {
        reason: error.message,
      });
    }

    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    return rows.map(toRecordingSessionItemDTO);
  }

  async createRecordingSession(
    workspaceId: string,
    input: CreateRecordingSessionRequest,
  ): Promise<RecordingSessionRow> {
    const workspace = await this.getWorkspaceOrThrow(workspaceId);
    const createdBy = await this.resolveRecordingSessionCreator(workspace);
    const endsAt = typeof input.ends_at === "undefined" ? null : input.ends_at;
    const calendarEventId = typeof input.calendar_event_id === "undefined" ? null : input.calendar_event_id;

    if (endsAt && new Date(endsAt).valueOf() < new Date(input.starts_at).valueOf()) {
      throw new HttpError(400, "invalid_time_window", "ends_at must be greater than or equal to starts_at");
    }
    if (calendarEventId) {
      await this.assertCalendarEventWorkspace(calendarEventId, workspaceId);
    }

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .insert({
        workspace_id: workspaceId,
        title: input.title.trim(),
        starts_at: input.starts_at,
        ends_at: endsAt,
        calendar_event_id: calendarEventId,
        created_by: createdBy,
      })
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to create recording session", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "recording_sessions insert returned no row");
    }

    if (calendarEventId) {
      const { error: calendarLinkError } = await this.supabase
        .schema("tongs")
        .from("calendar_events")
        .update({ session_id: data.id })
        .eq("id", calendarEventId)
        .eq("workspace_id", workspaceId);

      if (calendarLinkError) {
        throw new HttpError(502, "db_write_failed", "Failed to bind calendar event to recording session", {
          reason: calendarLinkError.message,
        });
      }
    }

    return data;
  }

  async updateRecordingSession(sessionId: string, patch: UpdateRecordingSessionRequest): Promise<RecordingSessionRow> {
    const current = await this.getRecordingSessionOrThrow(sessionId);
    const nextStartsAt = patch.starts_at ?? current.starts_at;
    const nextEndsAt = Object.prototype.hasOwnProperty.call(patch, "ends_at")
      ? (patch.ends_at ?? null)
      : current.ends_at;

    if (nextEndsAt && new Date(nextEndsAt).valueOf() < new Date(nextStartsAt).valueOf()) {
      throw new HttpError(400, "invalid_time_window", "ends_at must be greater than or equal to starts_at");
    }

    const update: Database["tongs"]["Tables"]["recording_sessions"]["Update"] = {};

    if (typeof patch.title !== "undefined") {
      update.title = patch.title.trim();
    }
    if (typeof patch.starts_at !== "undefined") {
      update.starts_at = patch.starts_at;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "ends_at")) {
      update.ends_at = patch.ends_at ?? null;
    }
    if (typeof patch.status !== "undefined") {
      update.status = patch.status;
    }

    if (Object.keys(update).length === 0) {
      throw new HttpError(400, "invalid_patch", "At least one updatable field is required");
    }

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .update(update)
      .eq("id", sessionId)
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to update recording session", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "recording_sessions update returned no row");
    }

    return data;
  }

  async deleteRecordingSession(sessionId: string): Promise<void> {
    await this.getRecordingSessionOrThrow(sessionId);

    const { error } = await this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .delete()
      .eq("id", sessionId);

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to delete recording session", {
        reason: error.message,
      });
    }
  }

  async listRecordingSessions(
    workspaceId: string,
    range?: RecordingSessionListRange,
  ): Promise<RecordingSessionRow[]> {
    await this.getWorkspaceOrThrow(workspaceId);

    let query = this.supabase
      .schema("tongs")
      .from("recording_sessions")
      .select("*")
      .eq("workspace_id", workspaceId);

    if (range?.starts_at) query = query.gte("starts_at", range.starts_at);
    if (range?.ends_at) query = query.lte("starts_at", range.ends_at);
    if (range?.limit) query = query.limit(range.limit);

    const { data, error } = await query
      .order("starts_at", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list recording sessions", {
        reason: error.message,
      });
    }

    return data ?? [];
  }

  async attachEpisodeToSession(
    sessionId: string,
    input: AttachEpisodeToSessionRequest,
  ): Promise<RecordingSessionEpisodeRow> {
    const session = await this.getRecordingSessionOrThrow(sessionId);
    const episode = await this.getCradleOrThrow(input.episode_id);
    if (episode.workspace_id !== session.workspace_id) {
      throw new HttpError(
        400,
        "workspace_mismatch",
        "Episode workspace must match recording session workspace",
      );
    }

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("recording_session_episodes")
      .upsert(
        {
          recording_session_id: sessionId,
          episode_id: input.episode_id,
          position: input.position ?? 0,
          notes: typeof input.notes === "undefined" ? null : input.notes,
        },
        { onConflict: "recording_session_id,episode_id" },
      )
      .select("*")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to attach episode to recording session", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "recording_session_episodes upsert returned no row");
    }

    return data;
  }

  async detachEpisodeFromSession(sessionId: string, episodeId: string): Promise<void> {
    await this.getRecordingSessionOrThrow(sessionId);

    const { error } = await this.supabase
      .schema("tongs")
      .from("recording_session_episodes")
      .delete()
      .eq("recording_session_id", sessionId)
      .eq("episode_id", episodeId);

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to detach episode from recording session", {
        reason: error.message,
      });
    }
  }

  async listSessionEpisodes(sessionId: string): Promise<SessionEpisodeListItem[]> {
    await this.getRecordingSessionOrThrow(sessionId);

    const { data: links, error: linksError } = await this.supabase
      .schema("tongs")
      .from("recording_session_episodes")
      .select("*")
      .eq("recording_session_id", sessionId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });

    if (linksError) {
      throw new HttpError(502, "db_read_failed", "Failed to list session episodes", {
        reason: linksError.message,
      });
    }

    if (!links || links.length === 0) {
      return [];
    }

    const episodeIds = links.map((row) => row.episode_id);
    const { data: episodes, error: episodesError } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .select("id,workspace_id,label,created_at,updated_at")
      .in("id", episodeIds);

    if (episodesError) {
      throw new HttpError(502, "db_read_failed", "Failed to read linked episodes", {
        reason: episodesError.message,
      });
    }

    const episodeById = new Map(
      (episodes ?? []).map((row) => [
        row.id,
        {
          id: row.id,
          workspace_id: row.workspace_id,
          label: row.label,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
      ]),
    );

    return links.map((row) => ({
      ...row,
      episode: episodeById.get(row.episode_id) ?? null,
    }));
  }

  private async readWorkpieceFileUpdatedAt(
    workpieceId: string,
    path: string,
  ): Promise<{ updated_at: string | null } | null> {
    const { data: fileRow, error: fileRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("updated_at")
      .eq("workpiece_id", workpieceId)
      .eq("path", path)
      .maybeSingle();

    if (fileRowError) {
      throw new HttpError(502, "db_read_failed", "Failed to read workpiece file metadata", {
        reason: fileRowError.message,
      });
    }

    return fileRow
      ? {
        updated_at: fileRow.updated_at ?? null,
      }
      : null;
  }

  async readWorkpieceJson(workpieceId: string, path: string): Promise<ReadJsonFileResult> {
    await this.getCradleOrThrow(workpieceId);
    const storageKey = buildStorageKey(workpieceId, path);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
    if (!bytes) return { found: false };
    const fileRow = await this.readWorkpieceFileUpdatedAt(workpieceId, path);
    const parsed = parseJsonText(textDecoder.decode(bytes), path);
    return { found: true, data: parsed, file_row: fileRow };
  }

  async readWorkspaceJson(workspaceId: string, path: string): Promise<ReadJsonFileResult> {
    const workspace = await this.getWorkspaceOrThrow(workspaceId);
    const bytes = await downloadStorageObjectFromCandidates(
      this.supabase,
      this.bucket,
      resolveWorkspaceCloudReadCandidates({
        workspaceId,
        legacyOwnerUserId: workspace.created_by,
      }, path),
    );
    if (!bytes) return { found: false };
    const parsed = parseJsonText(textDecoder.decode(bytes), path);
    return { found: true, data: parsed, file_row: null };
  }

  async readWorkpieceText(workpieceId: string, path: string): Promise<ReadTextFileResult> {
    await this.getCradleOrThrow(workpieceId);
    const storageKey = buildStorageKey(workpieceId, path);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
    if (!bytes) return { found: false };
    const fileRow = await this.readWorkpieceFileUpdatedAt(workpieceId, path);
    const text = normalizeLf(stripBom(textDecoder.decode(bytes)));
    return { found: true, text, file_row: fileRow };
  }

  async readWorkpieceBinary(workpieceId: string, path: string): Promise<ReadBinaryFileResult> {
    await this.getCradleOrThrow(workpieceId);
    const storageKey = buildStorageKey(workpieceId, path);
    const bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
    if (!bytes) return { found: false };

    const { data: fileRow, error: fileRowError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("content_type")
      .eq("workpiece_id", workpieceId)
      .eq("path", path)
      .maybeSingle();

    if (fileRowError) {
      throw new HttpError(502, "db_read_failed", "Failed to read workpiece file metadata", {
        reason: fileRowError.message,
      });
    }

    const contentType = fileRow?.content_type?.trim() || normalizeContentType(undefined, path);
    return {
      found: true,
      bytes_base64: encodeBase64(bytes),
      content_type: contentType,
    };
  }

  async readWorkspaceText(workspaceId: string, path: string): Promise<ReadTextFileResult> {
    const workspace = await this.getWorkspaceOrThrow(workspaceId);
    const bytes = await downloadStorageObjectFromCandidates(
      this.supabase,
      this.bucket,
      resolveWorkspaceCloudReadCandidates({
        workspaceId,
        legacyOwnerUserId: workspace.created_by,
      }, path),
    );
    if (!bytes) return { found: false };
    const text = normalizeLf(stripBom(textDecoder.decode(bytes)));
    return { found: true, text, file_row: null };
  }

  private async listStoragePrefix(
    storagePrefix: string,
    depth: number,
    scopeLabel: "workspace" | "workpiece",
  ): Promise<WorkspaceStorageTreeNode[]> {
    const { data, error } = await this.supabase.storage.from(this.bucket).list(storagePrefix, {
      limit: STORAGE_LIST_MAX_ITEMS_PER_DIRECTORY + 1,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) {
      throw new HttpError(502, "storage_list_failed", `Failed to list ${scopeLabel} storage root`, {
        reason: error.message,
        bucket: this.bucket,
        key: storagePrefix,
      });
    }

    const rows = Array.isArray(data) ? data as unknown as Array<Record<string, unknown>> : [];
    const truncated = rows.length > STORAGE_LIST_MAX_ITEMS_PER_DIRECTORY;
    const visibleRows = truncated ? rows.slice(0, STORAGE_LIST_MAX_ITEMS_PER_DIRECTORY) : rows;
    const nodes: WorkspaceStorageTreeNode[] = [];

    for (const row of visibleRows) {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!name) continue;

      const path = joinRelativePath(storagePrefix, name);
      const kind = inferWorkspaceStorageNodeKind(row);
      const node: WorkspaceStorageTreeNode = {
        name,
        kind,
        path,
        updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
      };

      if (kind === "directory") {
        if (depth > 0) {
          node.children = await this.listStoragePrefix(path, depth - 1, scopeLabel);
        } else {
          node.note = `Nested listing stops after depth ${STORAGE_LIST_MAX_DEPTH}.`;
        }
      } else {
        node.bytes = readWorkspaceStorageBytes(row);
      }

      nodes.push(node);
    }

    if (truncated) {
      nodes.push({
        name: "+ more items",
        kind: "file",
        path: joinRelativePath(storagePrefix, "__truncated__"),
        note: `Directory listing truncated after ${STORAGE_LIST_MAX_ITEMS_PER_DIRECTORY} entries.`,
      });
    }

    nodes.sort(compareWorkspaceStorageNodes);
    return nodes;
  }

  async listWorkspaceStorage(
    workspaceId: string,
    role: MountRole,
    options?: ListWorkspaceStorageOptions,
  ): Promise<WorkspaceStorageListing> {
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);
    const workspace = await this.getWorkspaceOrThrow(workspaceId);

    const prefix = normalizeOptionalRelativePath(options?.prefix ?? null);
    const depth = typeof options?.depth === "number" ? options.depth : STORAGE_LIST_MAX_DEPTH;
    const candidatePrefixes = resolveWorkspaceCloudListingPrefixes({
      workspaceId,
      legacyOwnerUserId: workspace.created_by,
    }, role, prefix);

    let rootPath = candidatePrefixes[0] ?? null;
    let nodes: WorkspaceStorageTreeNode[] = [];

    for (const candidatePrefix of candidatePrefixes) {
      const candidateNodes = await this.listStoragePrefix(candidatePrefix, depth, "workspace");
      rootPath = candidatePrefix;
      nodes = candidateNodes;
      if (candidateNodes.length > 0) {
        break;
      }
    }

    if (!rootPath) {
      throw new HttpError(500, "storage_prefix_resolution_failed", "Unable to resolve workspace cloud storage prefix", {
        workspace_id: workspaceId,
        role,
      });
    }

    return {
      source: {
        kind: "cloud_canonical",
        bucket: this.bucket,
        workspace_id: workspaceId,
        role,
        prefix,
        root_path: rootPath,
      },
      nodes,
    };
  }

  async listWorkpieceStorage(
    workpieceId: string,
    options?: ListWorkpieceStorageOptions,
  ): Promise<WorkpieceStorageListing> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    await this.assertWorkspaceRoleFromAccessToken(cradle.workspace_id, "viewer", options?.userAccessToken);

    const prefix = normalizeOptionalRelativePath(options?.prefix ?? null);
    const depth = typeof options?.depth === "number" ? options.depth : STORAGE_LIST_MAX_DEPTH;
    const rootPath = prefix ? buildStorageKey(workpieceId, prefix) : `workpieces/${workpieceId}`;
    const nodes = await this.listStoragePrefix(rootPath, depth, "workpiece");

    return {
      source: {
        kind: "cloud_workpiece",
        bucket: this.bucket,
        workspace_id: cradle.workspace_id,
        workpiece_id: workpieceId,
        prefix,
        root_path: rootPath,
      },
      nodes,
    };
  }

  async listWorkspaceCanonicalRecordings(
    workspaceId: string,
    options?: ListWorkspaceCanonicalRecordingsOptions,
  ): Promise<WorkspaceCanonicalRecordingListing> {
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);
    await this.getWorkspaceOrThrow(workspaceId);

    let query = this.supabase
      .schema("tongs")
      .from("episodes")
      .select("id,workspace_id,label,updated_at,archived_at")
      .eq("workspace_id", workspaceId);

    if (!options?.includeArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace episodes for canonical recordings", {
        reason: error.message,
      });
    }

    const episodes = Array.isArray(data) ? data : [];
    const keptTakeByWorkpiece = await this.listLatestKeptTakeByWorkpieceIds(
      episodes.map((episode) => episode.id),
    );
    const nodes: WorkspaceStorageTreeNode[] = [];

    for (const episode of episodes.sort((left, right) => {
      const leftReceipt = keptTakeByWorkpiece.get(left.id) ?? null;
      const rightReceipt = keptTakeByWorkpiece.get(right.id) ?? null;
      const byTakeTime = compareIsoTimestampDescending(
        leftReceipt?.created_at ?? null,
        rightReceipt?.created_at ?? null,
      );
      if (byTakeTime !== 0) return byTakeTime;
      const byEpisodeTime = compareIsoTimestampDescending(left.updated_at, right.updated_at);
      if (byEpisodeTime !== 0) return byEpisodeTime;
      return (left.label || left.id).localeCompare((right.label || right.id), undefined, {
        sensitivity: "base",
      });
    })) {
      const receipt = keptTakeByWorkpiece.get(episode.id);
      if (!receipt) continue;
      nodes.push(buildCanonicalRecordingWorkpieceNode(episode, receipt));
    }

    return {
      source: {
        kind: "cloud_workpiece_recordings",
        bucket: this.bucket,
        workspace_id: workspaceId,
        root_path: "workpieces/{workpiece_id}/recordings",
      },
      nodes,
    };
  }

  async listWorkspaceEpisodes(
    workspaceId: string,
    options?: ListWorkspaceEpisodesOptions,
  ): Promise<WorkspaceEpisodeSummary[]> {
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);
    await this.getWorkspaceOrThrow(workspaceId);

    let query = this.supabase
      .schema("tongs")
      .from("episodes")
      .select("id,workspace_id,label,created_at,updated_at,archived_at,archived_by,archive_reason")
      .eq("workspace_id", workspaceId);

    if (!options?.includeArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace episodes", {
        reason: error.message,
      });
    }

    return (data ?? []).map((row) => toWorkspaceEpisodeSummary(row));
  }

  async listWorkspaceSparks(
    workspaceId: string,
    options?: ListWorkspaceSparksOptions,
  ): Promise<WorkspaceSparkSummary[]> {
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);
    await this.getWorkspaceOrThrow(workspaceId);

    // These Bar-Stock tables are real in the target schema but are not yet represented in the
    // generated Database types. Keep access untyped here rather than letting the generated type
    // hole block the Tongs build and all downstream smoke validation.
    const tongsUntyped = this.supabase.schema("tongs") as unknown as {
      from: (table: string) => any;
    };

    const { data, error } = await tongsUntyped
      .from("barstock_sparks")
      .select("id,workspace_id,assignment_id,title,body,tags,status,created_at,updated_at")
      .eq("workspace_id", workspaceId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace sparks", {
        reason: error.message,
      });
    }

    const rawSparkRows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
    const sparkRows = rawSparkRows.map((row: Record<string, unknown>) => ({
      id: typeof row.id === "string" ? row.id : "",
      workspace_id: typeof row.workspace_id === "string" ? row.workspace_id : workspaceId,
      assignment_id: typeof row.assignment_id === "string" ? row.assignment_id : null,
      title: typeof row.title === "string" ? row.title : null,
      body: typeof row.body === "string" ? row.body : "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      status: typeof row.status === "string" ? row.status : "raw",
      created_at: typeof row.created_at === "string" ? row.created_at : new Date(0).toISOString(),
      updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date(0).toISOString(),
    })).filter((row) => row.id && row.body.trim().length > 0);

    const assignmentIds = [...new Set(
      sparkRows
        .map((row: { assignment_id: string | null }) => row.assignment_id)
        .filter((value: string | null): value is string => typeof value === "string" && value.length > 0),
    )];

    const linkedWorkpieceIdsByAssignment = new Map<string, string>();
    if (assignmentIds.length > 0) {
      const { data: links, error: linksError } = await tongsUntyped
        .from("barstock_project_episode_links")
        .select("project_id,workpiece_id")
        .eq("workspace_id", workspaceId)
        .in("project_id", assignmentIds);

      if (linksError) {
        throw new HttpError(502, "db_read_failed", "Failed to resolve workspace spark links", {
          reason: linksError.message,
        });
      }

      const linkRows = Array.isArray(links) ? links as Array<Record<string, unknown>> : [];
      for (const row of linkRows) {
        if (typeof row.project_id !== "string" || typeof row.workpiece_id !== "string") continue;
        linkedWorkpieceIdsByAssignment.set(row.project_id, row.workpiece_id);
      }
    }

    return sparkRows.map((row) => toWorkspaceSparkSummary(
      row,
      row.assignment_id ? linkedWorkpieceIdsByAssignment.get(row.assignment_id) ?? null : null,
    ));
  }

  async archiveWorkpiece(
    workpieceId: string,
    input: ArchiveWorkpieceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkspaceEpisodeSummary> {
    await this.getWorkspaceOrThrow(input.workspace_id);
    await this.assertWorkpieceInWorkspace(workpieceId, input.workspace_id);
    const auth = await this.assertWorkspaceRoleFromAccessToken(input.workspace_id, "editor", options?.userAccessToken);
    const archivedAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .update({
        archived_at: archivedAt,
        archived_by: auth.userId,
        archive_reason: input.reason ?? null,
      })
      .eq("id", workpieceId)
      .eq("workspace_id", input.workspace_id)
      .select("id,workspace_id,label,created_at,updated_at,archived_at,archived_by,archive_reason")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to archive workpiece", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "episodes archive update returned no row");
    }

    await this.insertEvent({
      workpieceId,
      eventName: "hearth.workpiece.archived.v1",
      payload: {
        workspace_id: input.workspace_id,
        archived_at: archivedAt,
        reason: input.reason ?? null,
      },
      writtenBy: {
        tool: "hearth",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
      correlationId: null,
    });

    return toWorkspaceEpisodeSummary(data);
  }

  async restoreWorkpiece(
    workpieceId: string,
    input: RestoreWorkpieceRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkspaceEpisodeSummary> {
    await this.getWorkspaceOrThrow(input.workspace_id);
    await this.assertWorkpieceInWorkspace(workpieceId, input.workspace_id);
    await this.assertWorkspaceRoleFromAccessToken(input.workspace_id, "editor", options?.userAccessToken);
    const cradle = await this.getCradleOrThrow(workpieceId);
    const readinessReset = await this.clearReadyEligibilityOnRestore(cradle);
    const restoredAt = new Date().toISOString();

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("id", workpieceId)
      .eq("workspace_id", input.workspace_id)
      .select("id,workspace_id,label,created_at,updated_at,archived_at,archived_by,archive_reason")
      .single();

    if (error) {
      throw new HttpError(502, "db_write_failed", "Failed to restore workpiece", {
        reason: error.message,
      });
    }
    if (!data) {
      throw new HttpError(502, "db_write_failed", "episodes restore update returned no row");
    }

    await this.insertEvent({
      workpieceId,
      eventName: "hearth.workpiece.restored.v1",
      payload: {
        workspace_id: input.workspace_id,
        restored_at: restoredAt,
        cleared_ready_paths: readinessReset.clearedPaths,
        cleared_ready_path_count: readinessReset.clearedPaths.length,
        cleared_ready_meta_count: readinessReset.clearedReadyMetaCount,
        ready_revalidation_required: readinessReset.clearedPaths.length > 0 || readinessReset.clearedReadyMetaCount > 0,
        ...(readinessReset.warnings.length > 0 ? { warnings: readinessReset.warnings } : {}),
      },
      writtenBy: {
        tool: "hearth",
        tool_version: "0.0.0",
        lane: "forge-managed",
      },
      correlationId: null,
    });

    return toWorkspaceEpisodeSummary(data);
  }

  async getWorkpieceImageMap(
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceImageMapResponseData> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    await this.assertWorkspaceRoleFromAccessToken(cradle.workspace_id, "viewer", options?.userAccessToken);

    const state = await this.readWorkpieceImageMapState(workpieceId, cradle.workspace_id);
    const assetRow = await this.getCurrentReadyImageMapAsset(cradle.workspace_id, workpieceId);
    return this.buildWorkpieceImageMapResponse({
      workpieceId,
      workspaceId: cradle.workspace_id,
      entries: state.episodePackage.image_map.entries,
      metadataUpdatedAt: state.metadataUpdatedAt,
      assetRow,
    });
  }

  async getWorkpieceVisualPackage(
    workpieceId: string,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceVisualPackageResponseData> {
    const cradle = await this.getCradleOrThrow(workpieceId);
    await this.assertWorkspaceRoleFromAccessToken(cradle.workspace_id, "viewer", options?.userAccessToken);

    const state = await this.readWorkpieceImageMapState(workpieceId, cradle.workspace_id);
    const imageMapAssetRow = await this.getCurrentReadyImageMapAsset(cradle.workspace_id, workpieceId);
    const selectedAssetRows = await this.listReadyImageMapCandidateAssetsForWorkpiece(cradle.workspace_id, workpieceId);
    const script = await this.resolvePreferredWorkpieceScript({ cradle });

    return this.buildWorkpieceVisualPackageResponse({
      workpieceId,
      workspaceId: cradle.workspace_id,
      scriptPath: script.path,
      scriptUpdatedAt: script.updatedAt,
      imageMapUpdatedAt: state.metadataUpdatedAt,
      imageMapAssetRow,
      entries: state.episodePackage.image_map.entries,
      selectedAssetRows,
    });
  }

  async generateImageMapCandidates(
    workpieceId: string,
    input: GenerateImageMapCandidatesRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<GenerateImageMapCandidatesResponse> {
    if (!this.imageProvider) {
      throw new HttpError(503, "image_map_candidate_provider_unavailable", "Image provider is not configured");
    }

    await this.getWorkspaceOrThrow(input.workspace_id);
    await this.assertWorkpieceInWorkspace(workpieceId, input.workspace_id);
    const userAccessToken = input.user_access_token ?? options?.userAccessToken ?? null;
    const auth = await this.assertWorkspaceRoleFromAccessToken(input.workspace_id, "editor", userAccessToken);

    const lane = input.lane ?? "forge";
    if (lane === "forge" && !input.always_approve_ai_spend && !input.confirm_spend) {
      throw new HttpError(409, "confirmation_required", "Generating still candidates spends AI credits", {
        requires_confirmation: true,
      });
    }

    const current = await this.readWorkpieceImageMapState(workpieceId, input.workspace_id);
    if (typeof input.expected_metadata_updated_at !== "undefined") {
      const expected = normalizeComparableIsoTimestampOrNull(input.expected_metadata_updated_at);
      const currentMetadataUpdatedAt = normalizeComparableIsoTimestampOrNull(current.metadataUpdatedAt);
      if (currentMetadataUpdatedAt !== expected) {
        throw new HttpError(409, "image_map_conflict", "Image map changed since last load.", {
          expected_metadata_updated_at: expected,
          current_metadata_updated_at: currentMetadataUpdatedAt,
        });
      }
    }

    const entry = current.episodePackage.image_map.entries.find((candidate) => candidate.id === input.image_map_entry_id) ?? null;
    if (!entry) {
      throw new HttpError(404, "image_map_entry_not_found", "Image map entry was not found");
    }
    if (!entry.script_anchor?.span_text?.trim()) {
      throw new HttpError(400, "image_map_anchor_required", "Image map entry must have a structured script anchor before generating candidates");
    }

    const priorCandidateAssets = await this.listReadyImageMapCandidateAssets(input.workspace_id, workpieceId, entry.id);
    const visualMode = inferImageMapVisualMode(
      entry,
      `${input.context_before ?? ""}\n${input.context_after ?? ""}`,
    );
    const aspect = input.aspect?.trim() || "16:9";
    const size = input.size?.trim() || null;
    const variants = [
      { label: "explainer", divergenceHint: null as string | null },
      {
        label: "illustrative",
        divergenceHint: "Use a noticeably different composition than the explainer variant: change framing, distance, and visual emphasis so the editor has a real choice.",
      },
    ];

    const generatedOutputs: Array<{
      variantLabel: string;
      visualMode: string;
      prompt: string;
      image: Awaited<ReturnType<ImageProvider["generateImage"]>>;
    }> = [];
    for (const variant of variants) {
      const prompt = buildImageMapCandidatePrompt({
        entry,
        visualMode,
        variantLabel: variant.label,
        contextBefore: input.context_before ?? null,
        contextAfter: input.context_after ?? null,
        divergenceHint: variant.divergenceHint,
      });
      const image = await this.imageProvider.generateImage({
        prompt,
        aspect,
        size,
      });
      generatedOutputs.push({
        variantLabel: variant.label,
        visualMode,
        prompt,
        image,
      });
    }

    if (generatedOutputs.length >= 2 && generatedOutputs[0]?.image.bytesBase64 === generatedOutputs[1]?.image.bytesBase64) {
      const retryPrompt = buildImageMapCandidatePrompt({
        entry,
        visualMode,
        variantLabel: generatedOutputs[1].variantLabel,
        contextBefore: input.context_before ?? null,
        contextAfter: input.context_after ?? null,
        divergenceHint: "The prior variant was too similar. Produce a substantially different visual take with different framing, subject arrangement, and editorial emphasis.",
      });
      const retryImage = await this.imageProvider.generateImage({
        prompt: retryPrompt,
        aspect,
        size,
      });
      generatedOutputs[1] = {
        ...generatedOutputs[1],
        prompt: retryPrompt,
        image: retryImage,
      };
      if (generatedOutputs[0]?.image.bytesBase64 === generatedOutputs[1]?.image.bytesBase64) {
        throw new HttpError(502, "image_map_candidates_too_similar", "Generated candidates were not distinct enough to offer a real editorial choice");
      }
    }

    const writtenBy: WrittenBy = {
      tool: "hearth",
      tool_version: "0.0.0",
      lane: "forge-managed",
    };
    const generatedAssetRows: AssetRow[] = [];
    const generatedAssets: ImageMapCandidateAssetSummary[] = [];
    let totalSpent = 0;

    try {
      for (const output of generatedOutputs) {
        const requestId = randomUuid();
        const assetId = randomUuid();
        const assetPath = buildImageMapCandidateAssetPath({
          workpieceId,
          entryId: entry.id,
          assetId,
          variantLabel: output.variantLabel,
          mimeType: output.image.mimeType,
        });
        const bytes = parseBase64ByteLength(output.image.bytesBase64);

        const assetCommit = await this.commitFile(workpieceId, {
          path: assetPath,
          content_type: output.image.mimeType,
          file_type: IMAGE_MAP_CANDIDATE_ASSET_KIND,
          bytes_base64: output.image.bytesBase64,
          written_by: writtenBy,
          event_name: "hearth.image_map.candidate.generated.v1",
          event_payload: {
            request_id: requestId,
            provider: output.image.provider,
            provider_request_id: output.image.providerRequestId,
            image_map_entry_id: entry.id,
            variant_label: output.variantLabel,
            visual_mode: output.visualMode,
          } as Json,
          correlation_id: requestId,
        });

        const assetRow = await this.insertAssetRow({
          id: assetId,
          workspace_id: input.workspace_id,
          workpiece_id: workpieceId,
          path: assetPath,
          mime_type: output.image.mimeType,
          bytes,
          storage_bucket: assetCommit.file_row.storage_bucket,
          storage_key: assetCommit.storage_key,
          provider: output.image.provider,
          provider_request_id: output.image.providerRequestId,
          request_id: requestId,
          prompt: output.prompt,
          created_by: auth.userId,
          asset_kind: IMAGE_MAP_CANDIDATE_ASSET_KIND,
          status: "ready",
          metadata_json: buildImageMapCandidateAssetMetadata({
            entry,
            visualMode: output.visualMode,
            variantLabel: output.variantLabel,
            prompt: output.prompt,
            revisedPrompt: output.image.revisedPrompt,
            aspect,
            size,
          }),
          supersedes_asset_id: null,
        }, "Failed to register generated image-map candidate asset");
        generatedAssetRows.push(assetRow);
        totalSpent += estimateImageTokenSpend(output.prompt, output.image.tokensUsed);

        const summary = normalizeImageMapCandidateAssetSummary(assetRow);
        if (!summary) {
          throw new HttpError(502, "invalid_generated_asset", "Generated image-map candidate asset could not be normalized");
        }
        generatedAssets.push(summary);
      }

      const nextEntries = current.episodePackage.image_map.entries.map((candidate) => {
        if (candidate.id !== entry.id) return candidate;
        return {
          ...candidate,
          source_type: "ai",
          candidate_assets: generatedAssets.map((asset) => ({
            asset_id: asset.id,
            path: asset.path,
            variant_label: asset.variant_label,
            visual_mode: asset.visual_mode,
            mime_type: asset.mime_type,
          })),
          selected_asset_id: null,
          status: "candidates_generated",
        };
      });

      const saved = await this.saveWorkpieceImageMap(workpieceId, {
        workspace_id: input.workspace_id,
        entries: nextEntries,
        expected_metadata_updated_at: current.metadataUpdatedAt,
      }, { userAccessToken });

      await this.supersedeAssets(
        priorCandidateAssets.map((asset) => asset.id),
        "Failed to supersede prior image map candidate assets",
      );

      let creditsWarning: string | undefined;
      let tokenBalance: number | null | undefined;
      if (lane === "forge") {
        const deltaResult = await this.applyAiTokenDelta({
          userId: auth.userId,
          spent: totalSpent,
          requestId: randomUuid(),
          providerRequestId: generatedAssets[0]?.provider_request_id ?? null,
          reason: "hearth:image_map_candidate_generate",
        });
        if ("warning" in deltaResult) {
          creditsWarning = deltaResult.warning;
        } else {
          tokenBalance = deltaResult.tokenBalance;
        }
      }

      return {
        image_map: saved.image_map,
        asset: saved.asset,
        generated_assets: generatedAssets,
        ...(creditsWarning ? { credits_warning: creditsWarning } : {}),
        ...(typeof tokenBalance === "number" ? { token_balance: tokenBalance } : {}),
      };
    } catch (error) {
      try {
        await this.supersedeAssets(
          generatedAssetRows.map((asset) => asset.id),
          "Failed to supersede stale generated image map candidate assets",
        );
      } catch {
        // Best effort cleanup only; preserve original failure.
      }
      throw error;
    }
  }

  async saveWorkpieceImageMap(
    workpieceId: string,
    input: SaveWorkpieceImageMapRequest,
    options?: { userAccessToken?: string | null },
  ): Promise<WorkpieceImageMapResponseData> {
    await this.getWorkspaceOrThrow(input.workspace_id);
    await this.assertWorkpieceInWorkspace(workpieceId, input.workspace_id);
    const auth = await this.assertWorkspaceRoleFromAccessToken(input.workspace_id, "editor", options?.userAccessToken);

    const current = await this.readWorkpieceImageMapState(workpieceId, input.workspace_id);
    const currentReadyAsset = await this.getCurrentReadyImageMapAsset(input.workspace_id, workpieceId);
    const latestImageMapAsset = currentReadyAsset
      ?? await this.getLatestImageMapAsset(input.workspace_id, workpieceId);
    if (typeof input.expected_metadata_updated_at !== "undefined") {
      const expected = normalizeComparableIsoTimestampOrNull(input.expected_metadata_updated_at);
      const currentMetadataUpdatedAt = normalizeComparableIsoTimestampOrNull(current.metadataUpdatedAt);
      if (currentMetadataUpdatedAt !== expected) {
        throw new HttpError(409, "image_map_conflict", "Image map changed since last load.", {
          expected_metadata_updated_at: expected,
          current_metadata_updated_at: currentMetadataUpdatedAt,
        });
      }
    }

    const nextEpisodePackage: EpisodePackageRecord = {
      ...current.episodePackage,
      image_map: {
        entries: input.entries,
      },
    };
    const nextMetadata = mirrorEpisodePackageToMetadata(
      {
        ...current.metadata,
      },
      nextEpisodePackage,
    );
    const writtenBy: WrittenBy = {
      tool: "hearth",
      tool_version: "0.0.0",
      lane: "forge-managed",
    };

    let metadataCommit: CommitFileResponse;
    try {
      metadataCommit = await this.commitFile(workpieceId, {
        path: "metadata.json",
        content_type: "application/json",
        json: nextMetadata,
        written_by: writtenBy,
        event_name: "hearth.image_map.package.saved.v1",
        event_payload: {
          entry_count: input.entries.length,
        } as Json,
        correlation_id: randomUuid(),
        ...(typeof input.expected_metadata_updated_at !== "undefined" && input.expected_metadata_updated_at !== null
          ? { expected_previous_updated_at: input.expected_metadata_updated_at }
          : {}),
      });
    } catch (error) {
      if (error instanceof HttpError && error.code === "file_conflict") {
        const details = (error.details && typeof error.details === "object")
          ? error.details as Record<string, unknown>
          : null;
        throw new HttpError(409, "image_map_conflict", "Image map changed since last load.", {
          expected_metadata_updated_at: readStringField(details ?? {}, "expected_previous_updated_at"),
          current_metadata_updated_at: readStringField(details ?? {}, "current_updated_at"),
        });
      }
      throw error;
    }

    const assetCommit = await this.commitFile(workpieceId, {
      path: IMAGE_MAP_ASSET_PATH,
      content_type: "application/json",
      file_type: "json",
      json: buildImageMapAssetDocument(workpieceId, input.entries),
      written_by: writtenBy,
      event_name: "hearth.image_map.asset.saved.v1",
      event_payload: {
        entry_count: input.entries.length,
        supersedes_asset_id: currentReadyAsset?.id ?? null,
      } as Json,
      correlation_id: randomUuid(),
    });

    const assetMetadata = {
      schema: IMAGE_MAP_ASSET_SCHEMA,
      entry_count: input.entries.length,
    } as Json;
    const assetPatch: Database["tongs"]["Tables"]["assets"]["Update"] = {
      path: IMAGE_MAP_ASSET_PATH,
      mime_type: "application/json",
      bytes: assetCommit.bytes,
      storage_bucket: assetCommit.file_row.storage_bucket,
      storage_key: assetCommit.storage_key,
      provider: "hearth",
      provider_request_id: null,
      request_id: assetCommit.event.correlation_id ?? assetCommit.event.id.toString(),
      prompt: null,
      asset_kind: IMAGE_MAP_ASSET_KIND,
      status: "ready",
      metadata_json: assetMetadata,
    };
    const assetAtCommittedLocation = await this.getImageMapAssetByStorageLocation(
      input.workspace_id,
      workpieceId,
      assetCommit.file_row.storage_bucket,
      assetCommit.storage_key,
    );
    const reusableImageMapAsset = assetAtCommittedLocation ?? currentReadyAsset ?? latestImageMapAsset;

    if (
      currentReadyAsset
      && reusableImageMapAsset
      && currentReadyAsset.id !== reusableImageMapAsset.id
    ) {
      await this.supersedeImageMapAsset(currentReadyAsset.id);
    }

    const assetRow = reusableImageMapAsset
      ? await this.updateImageMapAssetRow(
        reusableImageMapAsset.id,
        assetPatch,
        currentReadyAsset
          ? "Failed to refresh current image map asset"
          : "Failed to recover current image map asset",
      )
      : await this.insertImageMapAssetRow({
        workspace_id: input.workspace_id,
        workpiece_id: workpieceId,
        path: IMAGE_MAP_ASSET_PATH,
        mime_type: "application/json",
        bytes: assetCommit.bytes,
        storage_bucket: assetCommit.file_row.storage_bucket,
        storage_key: assetCommit.storage_key,
        provider: "hearth",
        provider_request_id: null,
        request_id: assetCommit.event.correlation_id ?? assetCommit.event.id.toString(),
        prompt: null,
        created_by: auth.userId,
        asset_kind: IMAGE_MAP_ASSET_KIND,
        status: "ready",
        metadata_json: assetMetadata,
        supersedes_asset_id: null,
      });

    return this.buildWorkpieceImageMapResponse({
      workpieceId,
      workspaceId: input.workspace_id,
      entries: nextEpisodePackage.image_map.entries,
      metadataUpdatedAt: normalizeComparableIsoTimestampOrNull(
        metadataCommit.file_row.updated_at ?? current.metadata.updated_at ?? null,
      ),
      assetRow,
    });
  }

  private async listLatestKeptTakeByWorkpieceIds(
    workpieceIds: readonly string[],
  ): Promise<Map<string, WorkpieceTakeReceipt>> {
    const next = new Map<string, WorkpieceTakeReceipt>();
    if (!workpieceIds.length) return next;

    const { data, error } = await this.supabase
      .schema("tongs")
      .from("workpiece_events")
      .select("workpiece_id,event_name,payload,created_at,id")
      .in("workpiece_id", [...workpieceIds])
      .eq("event_name", TAKE_KEPT_EVENT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(5000);

    if (error) {
      throw new HttpError(502, "db_read_failed", "Failed to list kept-take events", {
        reason: error.message,
      });
    }

    for (const row of data ?? []) {
      if (next.has(row.workpiece_id)) continue;
      next.set(row.workpiece_id, readTakeReceiptFromEvent(row));
    }

    return next;
  }

  async getWorkpieceRecordingTruth(workpieceId: string): Promise<WorkpieceRecordingTruth> {
    await this.getCradleOrThrow(workpieceId);
    const keptTakeByWorkpiece = await this.listLatestKeptTakeByWorkpieceIds([workpieceId]);
    return {
      workpiece_id: workpieceId,
      recorded: keptTakeByWorkpiece.has(workpieceId),
      latest_kept_take: keptTakeByWorkpiece.get(workpieceId) ?? null,
    };
  }

  async listWorkspaceReadyScripts(
    workspaceId: string,
    options?: ListWorkspaceReadyScriptsOptions,
  ): Promise<WorkspaceReadyScript[]> {
    await this.assertWorkspaceRoleFromAccessToken(workspaceId, "viewer", options?.userAccessToken);
    await this.getWorkspaceOrThrow(workspaceId);

    const { data: episodes, error: episodesError } = await this.supabase
      .schema("tongs")
      .from("episodes")
      .select("id,label,updated_at,created_at")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (episodesError) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace episodes", {
        reason: episodesError.message,
      });
    }

    if (!episodes || episodes.length === 0) {
      return [];
    }

    const episodeById = new Map<
      string,
      { id: string; label: string | null; updated_at: string | null; created_at: string | null }
    >();
    for (const row of episodes) {
      episodeById.set(row.id, {
        id: row.id,
        label: row.label ?? null,
        updated_at: row.updated_at ?? null,
        created_at: row.created_at ?? null,
      });
    }

    const workpieceIds = episodes.map((row) => row.id);
    const { data: files, error: filesError } = await this.supabase
      .schema("tongs")
      .from("workpiece_files")
      .select("workpiece_id,path,updated_at,created_at")
      .in("workpiece_id", workpieceIds)
      .in("path", READY_SCRIPT_PATH_CANDIDATES as unknown as string[]);

    if (filesError) {
      throw new HttpError(502, "db_read_failed", "Failed to list workspace script files", {
        reason: filesError.message,
      });
    }

    if (!files || files.length === 0) {
      return [];
    }

    const fileByWorkpiecePath = new Map<
      string,
      { workpiece_id: string; path: string; updated_at: string | null; created_at: string | null }
    >();
    const scriptPathsByWorkpiece = new Map<string, string[]>();

    for (const row of files) {
      const workpieceId = row.workpiece_id;
      const path = row.path;
      if (!READY_SCRIPT_PATH_SET.has(path)) continue;

      const existingPaths = scriptPathsByWorkpiece.get(workpieceId);
      if (!existingPaths) {
        scriptPathsByWorkpiece.set(workpieceId, [path]);
      } else if (!existingPaths.includes(path)) {
        existingPaths.push(path);
      }

      const readyKey = readyScriptMetaKey(workpieceId, path);
      const existingFile = fileByWorkpiecePath.get(readyKey);
      if (!existingFile) {
        fileByWorkpiecePath.set(readyKey, {
          workpiece_id: workpieceId,
          path,
          updated_at: row.updated_at ?? null,
          created_at: row.created_at ?? null,
        });
        continue;
      }

      if ((row.updated_at ?? row.created_at ?? "") > (existingFile.updated_at ?? existingFile.created_at ?? "")) {
        fileByWorkpiecePath.set(readyKey, {
          workpiece_id: workpieceId,
          path,
          updated_at: row.updated_at ?? null,
          created_at: row.created_at ?? null,
        });
      }
    }

    for (const scriptPaths of scriptPathsByWorkpiece.values()) {
      scriptPaths.sort((a, b) => {
        const byPriority = readyScriptPathPriority(a) - readyScriptPathPriority(b);
        if (byPriority !== 0) return byPriority;
        return a.localeCompare(b);
      });
    }

    const readyPointerByWorkpiece = new Map<
      string,
      {
        workpiece_id: string;
        script_path: string;
        marked_ready_by: string | null;
        marked_ready_at: string | null;
      }
    >();
    const readyPathsByWorkpiece = new Map<string, string[]>();
    const readyMetaCandidateIds = workpieceIds;
    if (readyMetaCandidateIds.length) {
      const { data: readyMetaRows, error: readyMetaError } = await this.supabase
        .schema("tongs")
        .from("workpiece_ready_script_meta")
        .select("workpiece_id,script_path,marked_ready_by,marked_ready_at")
        .eq("workspace_id", workspaceId)
        .in("workpiece_id", readyMetaCandidateIds);

      if (readyMetaError) {
        throw new HttpError(502, "db_read_failed", "Failed to list ready script metadata", {
          reason: readyMetaError.message,
        });
      }

      for (const row of readyMetaRows ?? []) {
        if (!READY_SCRIPT_PATH_SET.has(row.script_path)) continue;
        const readyKey = readyScriptMetaKey(row.workpiece_id, row.script_path);
        if (!fileByWorkpiecePath.has(readyKey)) continue;

        const existing = readyPointerByWorkpiece.get(row.workpiece_id);
        const existingMarkedAt = existing?.marked_ready_at ?? "";
        const nextMarkedAt = row.marked_ready_at ?? "";
        if (existing && existingMarkedAt > nextMarkedAt) {
          const knownPaths = readyPathsByWorkpiece.get(row.workpiece_id);
          if (!knownPaths) {
            readyPathsByWorkpiece.set(row.workpiece_id, [row.script_path]);
          } else if (!knownPaths.includes(row.script_path)) {
            knownPaths.push(row.script_path);
          }
          continue;
        }

        if (existing && existingMarkedAt === nextMarkedAt) {
          const existingPathPriority = readyScriptPathPriority(existing.script_path);
          const nextPathPriority = readyScriptPathPriority(row.script_path);
          if (
            nextPathPriority > existingPathPriority
            || (nextPathPriority === existingPathPriority && row.script_path > existing.script_path)
          ) {
            const knownPaths = readyPathsByWorkpiece.get(row.workpiece_id);
            if (!knownPaths) {
              readyPathsByWorkpiece.set(row.workpiece_id, [row.script_path]);
            } else if (!knownPaths.includes(row.script_path)) {
              knownPaths.push(row.script_path);
            }
            continue;
          }
        }

        readyPointerByWorkpiece.set(row.workpiece_id, {
          workpiece_id: row.workpiece_id,
          script_path: row.script_path,
          marked_ready_by: row.marked_ready_by,
          marked_ready_at: row.marked_ready_at,
        });

        const knownPaths = readyPathsByWorkpiece.get(row.workpiece_id);
        if (!knownPaths) {
          readyPathsByWorkpiece.set(row.workpiece_id, [row.script_path]);
        } else if (!knownPaths.includes(row.script_path)) {
          knownPaths.push(row.script_path);
        }
      }
    }

    for (const [workpieceId, scriptPaths] of scriptPathsByWorkpiece.entries()) {
      const knownPaths = readyPathsByWorkpiece.get(workpieceId);
      if (!knownPaths) {
        readyPathsByWorkpiece.set(workpieceId, [...scriptPaths]);
      } else {
        for (const path of scriptPaths) {
          if (!knownPaths.includes(path)) knownPaths.push(path);
        }
      }

      if (readyPointerByWorkpiece.has(workpieceId)) continue;

      let winnerPath: string | null = null;
      let winnerFile: { workpiece_id: string; path: string; updated_at: string | null; created_at: string | null } | null = null;
      for (const path of scriptPaths) {
        const candidateFile = fileByWorkpiecePath.get(readyScriptMetaKey(workpieceId, path));
        if (!candidateFile) continue;
        if (!winnerPath || !winnerFile) {
          winnerPath = path;
          winnerFile = candidateFile;
          continue;
        }

        const winnerStamp = winnerFile.updated_at ?? winnerFile.created_at ?? "";
        const candidateStamp = candidateFile.updated_at ?? candidateFile.created_at ?? "";
        if (candidateStamp > winnerStamp) {
          winnerPath = path;
          winnerFile = candidateFile;
          continue;
        }
        if (candidateStamp < winnerStamp) {
          continue;
        }

        const winnerPriority = readyScriptPathPriority(winnerPath);
        const candidatePriority = readyScriptPathPriority(path);
        if (candidatePriority < winnerPriority || (candidatePriority === winnerPriority && path < winnerPath)) {
          winnerPath = path;
          winnerFile = candidateFile;
        }
      }

      if (!winnerPath || !winnerFile) continue;
      readyPointerByWorkpiece.set(workpieceId, {
        workpiece_id: workpieceId,
        script_path: winnerPath,
        marked_ready_by: null,
        marked_ready_at: winnerFile.updated_at ?? winnerFile.created_at ?? null,
      });
    }

    if (readyPointerByWorkpiece.size === 0) {
      return [];
    }

    for (const readyPaths of readyPathsByWorkpiece.values()) {
      readyPaths.sort((a, b) => {
        const byPriority = readyScriptPathPriority(a) - readyScriptPathPriority(b);
        if (byPriority !== 0) return byPriority;
        return a.localeCompare(b);
      });
    }

    const scriptTitleFallbackByWorkpiece = new Map<string, string>();
    for (const [workpieceId, readyPaths] of readyPathsByWorkpiece.entries()) {
      const episodeLabel = episodeById.get(workpieceId)?.label ?? null;
      if (!isPlaceholderEpisodeLabel(episodeLabel)) continue;

      const candidatePaths = readyPaths.length
        ? readyPaths
        : (scriptPathsByWorkpiece.get(workpieceId) ?? []);
      for (const candidatePath of candidatePaths) {
        const storageKey = buildStorageKey(workpieceId, candidatePath);
        let bytes: Uint8Array | null = null;
        try {
          bytes = await downloadStorageObject(this.supabase, this.bucket, storageKey);
        } catch {
          bytes = null;
        }
        if (!bytes) continue;
        const extractedTitle = extractScriptTitleFromText(textDecoder.decode(bytes));
        if (!extractedTitle) continue;
        scriptTitleFallbackByWorkpiece.set(workpieceId, extractedTitle);
        break;
      }
    }

    const recordedWorkpieceIds = new Set<string>();
    if (options?.unrecordedOnly) {
      const keptTakeByWorkpiece = await this.listLatestKeptTakeByWorkpieceIds(
        Array.from(readyPathsByWorkpiece.keys()),
      );
      for (const workpieceId of keptTakeByWorkpiece.keys()) {
        recordedWorkpieceIds.add(workpieceId);
      }
    }

    const categoryByWorkpiece = new Map<string, string | null>();
    const categoryCandidateIds = Array.from(readyPathsByWorkpiece.keys());
    if (categoryCandidateIds.length) {
      const { data: categoryEvents, error: categoryEventsError } = await this.supabase
        .schema("tongs")
        .from("workpiece_events")
        .select("workpiece_id,event_name,payload,created_at,id")
        .in("workpiece_id", categoryCandidateIds)
        .eq("event_name", CONTENT_CATEGORY_EVENT)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5000);

      if (categoryEventsError) {
        throw new HttpError(502, "db_read_failed", "Failed to list workspace content-category events", {
          reason: categoryEventsError.message,
        });
      }

      for (const row of categoryEvents ?? []) {
        if (categoryByWorkpiece.has(row.workpiece_id)) continue;
        const category = readContentCategoryFromEventPayload(row.payload);
        categoryByWorkpiece.set(row.workpiece_id, category);
      }
    }

    const queueStateByWorkpiece = await this.listReadyQueueState(
      workspaceId,
      Array.from(readyPathsByWorkpiece.keys()),
    );

    const nowIso = new Date().toISOString();
    const readyScripts: WorkspaceReadyScript[] = [];
    for (const [workpieceId, readyPointer] of readyPointerByWorkpiece.entries()) {
      if (recordedWorkpieceIds.has(workpieceId)) continue;
      const readyKey = readyScriptMetaKey(workpieceId, readyPointer.script_path);
      const file = fileByWorkpiecePath.get(readyKey);
      if (!file) continue;
      const episode = episodeById.get(workpieceId);
      const episodeLabel = episode?.label?.trim() ?? "";
      const title = sanitizeReadyDisplayTitle(episodeLabel)
        ?? sanitizeReadyDisplayTitle(scriptTitleFallbackByWorkpiece.get(workpieceId));
      if (!title) continue;
      const primaryScriptPath = readyPointer.script_path;
      const knownPaths = readyPathsByWorkpiece.get(workpieceId) ?? [primaryScriptPath];
      const scriptPaths = knownPaths.includes(primaryScriptPath)
        ? knownPaths
        : [primaryScriptPath, ...knownPaths];
      const queueState = queueStateByWorkpiece.get(workpieceId) ?? null;
      const next: WorkspaceReadyScript = {
        workspace_id: workspaceId,
        workpiece_id: workpieceId,
        path: primaryScriptPath,
        primary_script_path: primaryScriptPath,
        script_paths: scriptPaths,
        title,
        updated_at: readyPointer.marked_ready_at
          ?? file.updated_at
          ?? file.created_at
          ?? episode?.updated_at
          ?? episode?.created_at
          ?? nowIso,
        content_category: categoryByWorkpiece.get(workpieceId) ?? null,
        marked_ready_by: readyPointer.marked_ready_by ?? null,
        marked_ready_at: readyPointer.marked_ready_at ?? null,
        queue_rank: queueState?.queue_rank ?? null,
        hidden_at: queueState?.hidden_at ?? null,
        hidden_by: queueState?.hidden_by ?? null,
      };
      if (next.hidden_at && !options?.includeHidden) continue;
      readyScripts.push(next);
    }

    readyScripts.sort(compareWorkspaceReadyScripts);

    return readyScripts;
  }

  async appendEvent(workpieceId: string, input: AppendEventRequest): Promise<WorkpieceEventRow> {
    await this.getCradleOrThrow(workpieceId);
    return this.insertEvent({
      workpieceId,
      eventName: normalizeNonEmptyString(input.event_name, "event_name"),
      payload: typeof input.payload === "undefined" ? ({} as Json) : input.payload,
      writtenBy: normalizeWrittenBy(input.written_by),
      correlationId: normalizeCorrelationId(input.correlation_id),
    });
  }
}

function requireMethod(request: Request, method: string): void {
  if (request.method !== method) {
    throw new HttpError(405, "method_not_allowed", `Expected ${method} for this endpoint`);
  }
}

function checkApiToken(request: Request, token: string | undefined): void {
  if (!token) return;
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${token}`;
  if (auth !== expected) {
    throw new HttpError(401, "unauthorized", "Missing or invalid API token");
  }
}

function readUserAccessTokenHeader(request: Request): string | null {
  const explicit = request.headers.get("x-forge-user-token");
  if (explicit && explicit.trim()) return explicit.trim();

  const authHeader = request.headers.get("x-forge-user-authorization");
  if (!authHeader) return null;
  const trimmed = authHeader.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith("bearer ")) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }
  return trimmed;
}

function requireUserAccessTokenHeader(request: Request): string {
  const token = readUserAccessTokenHeader(request);
  if (token) return token;
  throw new HttpError(
    401,
    "missing_user_token_header",
    "Missing x-forge-user-authorization (or x-forge-user-token) header",
  );
}

function parseBooleanQueryFlag(value: string | null): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1"
    || normalized === "true"
    || normalized === "yes"
    || normalized === "on";
}

export function createTongsCommitService(options: TongsCommitApiOptions): TongsCommitService {
  const url = normalizeNonEmptyString(options.supabaseUrl, "supabaseUrl");
  const key = normalizeNonEmptyString(options.supabaseServiceRoleKey, "supabaseServiceRoleKey");
  const bucket = options.bucket?.trim() || TONGS_WORKPIECE_BUCKET;

  const supabase = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const openAiImageApiKey = options.openAiImageApiKey?.trim() || options.openAiApiKey?.trim();
  const imageProvider = openAiImageApiKey
    ? new OpenAiImageProvider(openAiImageApiKey, options.openAiImageModel?.trim() || "gpt-image-1")
    : null;

  return new TongsCommitService(supabase, bucket, imageProvider);
}

export function createTongsCommitApiHandlerWithService(
  service: TongsCommitApiService,
  apiToken?: string,
): (request: Request) => Promise<Response> {
  const normalizedApiToken = apiToken?.trim() || undefined;
  return async (request: Request): Promise<Response> => {
    const requestId = createRequestId();
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "x-request-id": requestId,
        },
      });
    }

    try {
      checkApiToken(request, normalizedApiToken);

      const url = new URL(request.url);
      const parts = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);

      if (parts.length === 2 && parts[0] === "tongs" && parts[1] === "cradles") {
        requireMethod(request, "POST");
        const body = await parseJsonBody(request);
        const payload = normalizeCreateCradleRequest(body);
        const result = await service.createCradle(payload);
        return jsonResponse(201, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "commit-file") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const userAccessToken = readUserAccessTokenHeader(request);
        const payload = normalizeCommitFileRequest(body, userAccessToken);
        if (READY_SCRIPT_PATH_SET.has(payload.path) && !userAccessToken) {
          throw new HttpError(
            401,
            "missing_user_token_header",
            "Missing x-forge-user-authorization (or x-forge-user-token) header",
          );
        }
        const result = await service.commitFile(workpieceId, payload);
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "commit-file") {
        requireMethod(request, "POST");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const body = await parseJsonBody(request);
        const userAccessToken = readUserAccessTokenHeader(request);
        const payload = normalizeCommitFileRequest(body, userAccessToken);
        const result = await service.commitWorkspaceFile(workspaceId, payload);
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "generate-thumbnail") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const userAccessToken = requireUserAccessTokenHeader(request);
        const payload = normalizeGenerateEpisodeThumbnailRequest(body, workpieceId, userAccessToken);
        const result = await service.generateEpisodeThumbnail(workpieceId, payload);
        return jsonResponse(200, { ok: true, data: result });
      }

      if (
        parts.length === 4
        && parts[0] === "tongs"
        && parts[1] === "workpieces"
        && parts[3] === "visual-package"
      ) {
        requireMethod(request, "GET");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.getWorkpieceVisualPackage(workpieceId, { userAccessToken });
        return jsonResponse(200, { ok: true, data: result });
      }

      if (
        parts.length === 5
        && parts[0] === "tongs"
        && parts[1] === "workpieces"
        && parts[3] === "image-map"
        && parts[4] === "generate-candidates"
      ) {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const userAccessToken = requireUserAccessTokenHeader(request);
        const payload = normalizeGenerateImageMapCandidatesRequest(body, userAccessToken);
        const result = await service.generateImageMapCandidates(workpieceId, payload, { userAccessToken });
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "image-map") {
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const userAccessToken = requireUserAccessTokenHeader(request);

        if (request.method === "GET") {
          const result = await service.getWorkpieceImageMap(workpieceId, { userAccessToken });
          return jsonResponse(200, { ok: true, data: result });
        }

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          const payload = normalizeSaveWorkpieceImageMapRequest(body);
          const result = await service.saveWorkpieceImageMap(workpieceId, payload, { userAccessToken });
          return jsonResponse(200, { ok: true, data: result });
        }

        throw new HttpError(405, "method_not_allowed", "Method not allowed");
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "ready-scripts") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const unrecordedOnly = parseBooleanQueryFlag(url.searchParams.get("unrecorded"));
        const includeHidden = parseBooleanQueryFlag(url.searchParams.get("include_hidden"));
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.listWorkspaceReadyScripts(workspaceId, {
          unrecordedOnly,
          includeHidden,
          userAccessToken,
        });
        return jsonResponse(200, { ok: true, data: { scripts: result } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "sparks") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.listWorkspaceSparks(workspaceId, { userAccessToken });
        return jsonResponse(200, { ok: true, data: { sparks: result } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "episodes") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const userAccessToken = requireUserAccessTokenHeader(request);
        const includeArchived = parseBooleanQueryFlag(url.searchParams.get("include_archived"));
        const result = await service.listWorkspaceEpisodes(workspaceId, { userAccessToken, includeArchived });
        return jsonResponse(200, { ok: true, data: { episodes: result } });
      }

      if (parts.length === 5 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "storage") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const role = normalizeMountRole(decodeURIComponent(parts[4]), "role");
        const prefix = normalizeOptionalRelativePath(url.searchParams.get("prefix"));
        const depth = normalizeStorageListDepth(url.searchParams.get("depth"));
        const userAccessToken = requireUserAccessTokenHeader(request);
        const listing = await service.listWorkspaceStorage(workspaceId, role, {
          prefix,
          depth,
          userAccessToken,
        });
        return jsonResponse(200, { ok: true, data: { listing } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "canonical-recordings") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const includeArchived = parseBooleanQueryFlag(url.searchParams.get("include_archived"));
        const userAccessToken = requireUserAccessTokenHeader(request);
        const listing = await service.listWorkspaceCanonicalRecordings(workspaceId, {
          includeArchived,
          userAccessToken,
        });
        return jsonResponse(200, { ok: true, data: { listing } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "storage") {
        requireMethod(request, "GET");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const prefix = normalizeOptionalRelativePath(url.searchParams.get("prefix"));
        const depth = normalizeStorageListDepth(url.searchParams.get("depth"));
        const userAccessToken = requireUserAccessTokenHeader(request);
        const listing = await service.listWorkpieceStorage(workpieceId, {
          prefix,
          depth,
          userAccessToken,
        });
        return jsonResponse(200, { ok: true, data: { listing } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "archive") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const payload = normalizeArchiveWorkpieceRequest(body);
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.archiveWorkpiece(workpieceId, payload, { userAccessToken });
        return jsonResponse(200, { ok: true, data: { workpiece: result } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "restore") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const payload = normalizeRestoreWorkpieceRequest(body);
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.restoreWorkpiece(workpieceId, payload, { userAccessToken });
        return jsonResponse(200, { ok: true, data: { workpiece: result } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "ready-queue-state") {
        requireMethod(request, "POST");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const body = await parseJsonBody(request);
        const payload = normalizeUpdateWorkspaceReadyQueueStateRequest(body);
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.updateWorkspaceReadyQueueState(workspaceId, payload, { userAccessToken });
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "ready-script") {
        requireMethod(request, "DELETE");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const path = normalizeRelativePath(url.searchParams.get("path"));
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.deleteReadyScript(workpieceId, path, { userAccessToken });
        return jsonResponse(200, {
          ok: true,
          data: {
            deleted: result.deleted,
            workpiece_id: result.workpiece_id,
            path: result.path,
            already_deleted: result.already_deleted,
            removed_session_item_count: result.removed_session_item_count,
            ready_meta_deleted: result.ready_meta_deleted,
            warnings: result.warnings,
          },
        });
      }

      if (
        parts.length === 7
        && parts[0] === "tongs"
        && parts[1] === "workspaces"
        && parts[3] === "workpieces"
        && parts[5] === "hammer"
        && parts[6] === "state"
      ) {
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[4]), "workpiece_id");
        const userAccessToken = requireUserAccessTokenHeader(request);

        if (request.method === "GET") {
          const snapshot = await service.readHammerWorkpieceState(
            workspaceId,
            workpieceId,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { snapshot } });
        }

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          const payload = normalizeSaveHammerWorkpieceStateRequest(body);
          const snapshot = await service.saveHammerWorkpieceState(
            workspaceId,
            workpieceId,
            payload,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { snapshot } });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or PUT for this endpoint");
      }

      if (
        parts.length === 7
        && parts[0] === "tongs"
        && parts[1] === "workspaces"
        && parts[3] === "workpieces"
        && parts[5] === "hammer"
        && parts[6] === "presence"
      ) {
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[4]), "workpiece_id");
        const userAccessToken = requireUserAccessTokenHeader(request);

        if (request.method === "GET") {
          const presence = await service.listHammerWorkpiecePresence(
            workspaceId,
            workpieceId,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { presence } });
        }

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          const payload = normalizeUpsertHammerWorkpiecePresenceRequest(body);
          const presence = await service.upsertHammerWorkpiecePresence(
            workspaceId,
            workpieceId,
            payload,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { presence } });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or PUT for this endpoint");
      }

      if (
        parts.length === 6
        && parts[0] === "tongs"
        && parts[1] === "workspaces"
        && parts[3] === "workpieces"
        && parts[5] === "presence"
      ) {
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[4]), "workpiece_id");
        const userAccessToken = requireUserAccessTokenHeader(request);

        if (request.method === "GET") {
          const presence = await service.listHearthWorkpiecePresence(
            workspaceId,
            workpieceId,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { presence } });
        }

        if (request.method === "PUT") {
          const body = await parseJsonBody(request);
          const payload = normalizeUpsertHearthWorkpiecePresenceRequest(body);
          const presence = await service.upsertHearthWorkpiecePresence(
            workspaceId,
            workpieceId,
            payload,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { presence } });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or PUT for this endpoint");
      }

      if (
        parts.length === 6
        && parts[0] === "tongs"
        && parts[1] === "workspaces"
        && parts[3] === "calendar-events"
        && parts[5] === "assignments"
      ) {
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const calendarEventId = normalizeUuid(decodeURIComponent(parts[4]), "calendar_event_id");
        const userAccessToken = requireUserAccessTokenHeader(request);

        if (request.method === "GET") {
          const assignments = await service.listCalendarEventAssignmentsForEvent(
            workspaceId,
            calendarEventId,
            { userAccessToken },
          );
          return jsonResponse(200, { ok: true, data: { assignments } });
        }

        if (request.method === "POST") {
          const body = await parseJsonBody(request);
          const payload = normalizeAttachCalendarEventAssignmentRequest(body);
          const assignment = await service.attachCalendarEventAssignment(
            workspaceId,
            calendarEventId,
            payload,
            { userAccessToken },
          );
          return jsonResponse(201, { ok: true, data: { assignment } });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or POST for this endpoint");
      }

      if (
        parts.length === 7
        && parts[0] === "tongs"
        && parts[1] === "workspaces"
        && parts[3] === "calendar-events"
        && parts[5] === "assignments"
      ) {
        requireMethod(request, "DELETE");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const calendarEventId = normalizeUuid(decodeURIComponent(parts[4]), "calendar_event_id");
        const assignmentId = normalizeUuid(decodeURIComponent(parts[6]), "assignment_id");
        const userAccessToken = requireUserAccessTokenHeader(request);
        const result = await service.detachCalendarEventAssignment(
          workspaceId,
          calendarEventId,
          assignmentId,
          { userAccessToken },
        );
        return jsonResponse(200, { ok: true, data: result });
      }

      if (parts.length === 2 && (parts[0] === "tongs" || parts[0] === "api") && parts[1] === "recording-sessions") {
        if (request.method === "GET") {
          const options = normalizeRecordingSessionListOptions(url.searchParams);
          const result = await service.listRecordingSessionsForPlanner(options);
          return jsonResponse(200, { ok: true, data: { sessions: result } });
        }

        if (request.method === "POST") {
          const body = await parseJsonBody(request);
          const payload = normalizeCreateRecordingSessionRecordRequest(body);
          const result = await service.createRecordingSessionRecord(payload);
          return jsonResponse(201, { ok: true, data: result });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or POST for this endpoint");
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "recording-sessions") {
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        if (request.method === "GET") {
          const range = normalizeRecordingSessionListRange(url.searchParams);
          const result = await service.listRecordingSessions(workspaceId, range);
          return jsonResponse(200, { ok: true, data: { sessions: result } });
        }

        if (request.method === "POST") {
          const body = await parseJsonBody(request);
          const payload = normalizeCreateRecordingSessionRequest(body);
          const result = await service.createRecordingSession(workspaceId, payload);
          return jsonResponse(201, { ok: true, data: result });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or POST for this endpoint");
      }

      if (parts.length === 3 && (parts[0] === "tongs" || parts[0] === "api") && parts[1] === "recording-sessions") {
        const sessionId = normalizeUuid(decodeURIComponent(parts[2]), "session_id");
        if (request.method === "GET") {
          const result = await service.getRecordingSessionRecord(sessionId);
          return jsonResponse(200, { ok: true, data: result });
        }

        if (request.method === "PATCH") {
          const body = await parseJsonBody(request);
          const payload = normalizeUpdateRecordingSessionRequest(body);
          const result = await service.updateRecordingSession(sessionId, payload);
          return jsonResponse(200, { ok: true, data: result });
        }

        if (request.method === "DELETE") {
          await service.deleteRecordingSession(sessionId);
          return jsonResponse(200, {
            ok: true,
            data: {
              deleted: true,
              session_id: sessionId,
            },
          });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET, PATCH, or DELETE for this endpoint");
      }

      if (
        parts.length === 4
        && (parts[0] === "tongs" || parts[0] === "api")
        && parts[1] === "recording-sessions"
        && parts[3] === "items"
      ) {
        requireMethod(request, "PUT");
        const sessionId = normalizeUuid(decodeURIComponent(parts[2]), "session_id");
        const body = await parseJsonBody(request);
        const payload = normalizeReplaceRecordingSessionItemsRequest(body);
        const result = await service.replaceRecordingSessionItems(sessionId, payload);
        return jsonResponse(200, { ok: true, data: { items: result } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "recording-sessions" && parts[3] === "episodes") {
        const sessionId = normalizeUuid(decodeURIComponent(parts[2]), "session_id");
        if (request.method === "GET") {
          const result = await service.listSessionEpisodes(sessionId);
          return jsonResponse(200, { ok: true, data: { episodes: result } });
        }

        if (request.method === "POST") {
          const body = await parseJsonBody(request);
          const payload = normalizeAttachEpisodeToSessionRequest(body);
          const result = await service.attachEpisodeToSession(sessionId, payload);
          return jsonResponse(201, { ok: true, data: result });
        }

        throw new HttpError(405, "method_not_allowed", "Expected GET or POST for this endpoint");
      }

      if (
        parts.length === 5
        && parts[0] === "tongs"
        && parts[1] === "recording-sessions"
        && parts[3] === "episodes"
      ) {
        requireMethod(request, "DELETE");
        const sessionId = normalizeUuid(decodeURIComponent(parts[2]), "session_id");
        const episodeId = normalizeUuid(decodeURIComponent(parts[4]), "episode_id");
        await service.detachEpisodeFromSession(sessionId, episodeId);
        return jsonResponse(200, { ok: true, data: { detached: true } });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "read-file") {
        requireMethod(request, "GET");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const url = new URL(request.url);
        const path = normalizeRelativePath(url.searchParams.get("path"));
        const encoding = (url.searchParams.get("encoding") ?? "").trim().toLowerCase();

        if (encoding === "base64") {
          const result = await service.readWorkpieceBinary(workpieceId, path);
          if (!result.found) {
            return jsonResponse(404, {
              ok: true,
              exists: false,
            });
          }
          return jsonResponse(200, {
            ok: true,
            data: {
              bytes_base64: result.bytes_base64,
              content_type: result.content_type,
            },
          });
        }

        if (extensionOf(path) === ".json") {
          const result = await service.readWorkpieceJson(workpieceId, path);
          if (!result.found) {
            if (isBootstrapWorkpiecePath(path)) {
              return jsonResponse(200, { ok: true, data: null, exists: false });
            }
            return jsonResponse(404, {
              ok: true,
              exists: false,
            });
          }
          return jsonResponse(200, { ok: true, data: result.data, file_row: result.file_row ?? null });
        }

        if (!isLfTextFile(path)) {
          throw new HttpError(400, "invalid_path", "read-file supports JSON and UTF-8 text paths only");
        }

        const result = await service.readWorkpieceText(workpieceId, path);
        if (!result.found) {
          if (isBootstrapWorkpiecePath(path)) {
            return jsonResponse(200, { ok: true, data: null, exists: false });
          }
          return jsonResponse(404, {
            ok: true,
            exists: false,
          });
        }
        return jsonResponse(200, { ok: true, data: result.text, file_row: result.file_row ?? null });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workspaces" && parts[3] === "read-file") {
        requireMethod(request, "GET");
        const workspaceId = normalizeUuid(decodeURIComponent(parts[2]), "workspace_id");
        const url = new URL(request.url);
        const path = normalizeRelativePath(url.searchParams.get("path"));
        if (extensionOf(path) === ".json") {
          const result = await service.readWorkspaceJson(workspaceId, path);
          if (!result.found) {
            if (isBootstrapWorkspacePath(path)) {
              return jsonResponse(200, { ok: true, data: null, exists: false });
            }
            return jsonResponse(404, {
              ok: true,
              exists: false,
            });
          }
          return jsonResponse(200, { ok: true, data: result.data });
        }

        if (!isLfTextFile(path)) {
          throw new HttpError(400, "invalid_path", "read-file supports JSON and UTF-8 text paths only");
        }

        const result = await service.readWorkspaceText(workspaceId, path);
        if (!result.found) {
          return jsonResponse(404, {
            ok: true,
            exists: false,
          });
        }
        return jsonResponse(200, { ok: true, data: result.text });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "append-event") {
        requireMethod(request, "POST");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const body = await parseJsonBody(request);
        const payload = normalizeAppendEventRequest(body);
        const result = await service.appendEvent(workpieceId, payload);
        return jsonResponse(201, { ok: true, data: result });
      }

      if (parts.length === 4 && parts[0] === "tongs" && parts[1] === "workpieces" && parts[3] === "recording-truth") {
        requireMethod(request, "GET");
        const workpieceId = normalizeUuid(decodeURIComponent(parts[2]), "workpiece_id");
        const result = await service.getWorkpieceRecordingTruth(workpieceId);
        return jsonResponse(200, { ok: true, data: { truth: result } });
      }

      throw new HttpError(404, "not_found", "Endpoint not found");
    } catch (error) {
      if (error instanceof HttpError && (error.status === 401 || error.status === 403)) {
        try {
          console.warn("[tongs-auth-deny]", {
            request_id: requestId,
            code: error.code,
            message: error.message,
            details: error.details ?? null,
            path: request.url,
            method: request.method,
          });
        } catch {
          // ignore logging failures
        }
      }
      return errorResponse(error, requestId);
    }
  };
}

export function createTongsCommitApiHandler(options: TongsCommitApiOptions): (request: Request) => Promise<Response> {
  const service = createTongsCommitService(options);
  return createTongsCommitApiHandlerWithService(service, options.apiToken);
}
