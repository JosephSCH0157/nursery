import type { QuenchPlatform, ReleaseMode } from "./release-packet.types";

export const FINALIZED_DESTINATION_PACKAGE_VERSION = "forge.finalized-destination-package.v1" as const;

export type CanonicalSelectionRef = Readonly<{
  id: string;
  revision: number;
  content_hash: string;
}>;

export type DestinationDeliveryMethod =
  | "youtube_resumable_video"
  | "youtube_thumbnail"
  | "youtube_caption"
  | "description_canonical_block"
  | "rumble_download"
  | "rumble_copy"
  | "not_delivered";

export type DestinationPackageAsset = Readonly<{
  kind: "video" | "audio" | "thumbnail" | "caption" | "transcript" | "source_disclosure" | "supporting_asset";
  ref: CanonicalSelectionRef;
  delivery: DestinationDeliveryMethod;
  canonical_path?: string | null;
  public_url?: string | null;
  required: boolean;
}>;

export type DraftDestinationConfiguration = Readonly<{
  platform: QuenchPlatform;
  executable_destination_id: string;
  mode: ReleaseMode;
  visibility: "private" | "unlisted" | "public";
  scheduled_for?: string | null;
  timezone: string;
  category_id?: string | null;
  notify_subscribers?: boolean;
  title: CanonicalSelectionRef & { text: string; rank: number };
  description: CanonicalSelectionRef & { text: string; kind: "short" | "long" };
  assets: readonly DestinationPackageAsset[];
}>;

export type FinalizedDestinationPackage = DraftDestinationConfiguration & Readonly<{
  contract_version: typeof FINALIZED_DESTINATION_PACKAGE_VERSION;
  workspace_id: string;
  workpiece_id: string;
  manifest_snapshot_id: string;
  manifest_content_hash: string;
  metadata_revision: number;
  metadata_content_hash: string;
  destination_capability_revision_id: string;
  destination_capability_content_hash: string;
  finalized_at: string;
}>;

export type DestinationPackageIssue = Readonly<{ code: string; field: string; message: string }>;

const YOUTUBE_DELIVERY = new Set<DestinationDeliveryMethod>([
  "youtube_resumable_video", "youtube_thumbnail", "youtube_caption", "description_canonical_block", "not_delivered",
]);
const RUMBLE_DELIVERY = new Set<DestinationDeliveryMethod>([
  "rumble_download", "rumble_copy", "not_delivered",
]);

export function validateDestinationPackageDraft(draft: DraftDestinationConfiguration): DestinationPackageIssue[] {
  const issues: DestinationPackageIssue[] = [];
  if (!draft.executable_destination_id.trim()) issues.push({ code: "destination_required", field: "destination", message: "Choose a destination." });
  if (!draft.title.id || !draft.title.text.trim()) issues.push({ code: "title_required", field: "title", message: "Choose an approved title." });
  if (!draft.description.id || !draft.description.text.trim()) issues.push({ code: "description_required", field: "description", message: "Choose an approved description." });
  if (draft.mode === "schedule" && !draft.scheduled_for) issues.push({ code: "schedule_required", field: "scheduled_for", message: "Choose a publication date and time." });
  const allowed = draft.platform === "youtube" ? YOUTUBE_DELIVERY : draft.platform === "rumble" ? RUMBLE_DELIVERY : new Set<DestinationDeliveryMethod>();
  for (const asset of draft.assets) {
    if (!asset.ref.id || !asset.ref.content_hash) issues.push({ code: "canonical_asset_required", field: asset.kind, message: `${asset.kind} is not pinned to canonical authority.` });
    if (!allowed.has(asset.delivery)) issues.push({ code: "unsupported_delivery", field: asset.kind, message: `${asset.kind} cannot be delivered to ${draft.platform}.` });
    if (asset.delivery === "description_canonical_block" && !asset.public_url) issues.push({ code: "public_link_required", field: asset.kind, message: `${asset.kind} needs a canonical public link.` });
    if (asset.required && asset.delivery === "not_delivered") issues.push({ code: "required_asset_not_delivered", field: asset.kind, message: `${asset.kind} needs a supported delivery path.` });
  }
  if (draft.platform === "youtube" && !draft.assets.some((asset) => asset.kind === "video" && asset.delivery === "youtube_resumable_video")) {
    issues.push({ code: "youtube_video_required", field: "video", message: "Choose the canonical video export." });
  }
  return issues;
}

export type SanitizedPublicationProgress = Readonly<{
  publication_operation_id: string;
  stage: "queued" | "video_upload" | "provider_processing" | "thumbnail" | "captions" | "scheduled" | "published" | "blocked" | "failed" | "outcome_unknown";
  transferred_bytes: number;
  total_bytes: number;
  percent: number;
  retryable: boolean;
  user_action_code: string | null;
  provider_processing_state: string | null;
  external_object_id: string | null;
  external_url: string | null;
  updated_at: string;
}>;
