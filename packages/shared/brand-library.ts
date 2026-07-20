export const BRAND_LIBRARY_SCHEMA_VERSION = "forge.brand-library.v1" as const;
export const BRAND_BINDING_PROJECTION_VERSION = "forge.workpiece-brand-binding.v1" as const;

export type BrandAssetRole = "primary_logo" | "secondary_logo" | "alternate_logo" | "transparent_logo" | "watermark_logo" | "audio_intro" | "audio_outro" | "video_intro" | "video_outro" | "intro_media" | "outro_media" | "theme_music" | "intro_stinger" | "outro_stinger" | "music_bed";
export type BrandAssetRevisionState = "pending" | "ready" | "failed" | "superseded" | "archived";

export type BrandRules = {
  public_identity: { program_name: string; tagline: string | null; display_name?: string | null; description?: string | null };
  palette: { primary: string; secondary: string; accent: string };
  typography: { heading_family: string; body_family: string; heading_weight: number; body_weight: number };
  logo: { placement: "top_left" | "top_right" | "bottom_left" | "bottom_right"; watermark_opacity: number };
  audio: { music_volume: number; ducking: number };
  asset_revision_ids: Partial<Record<BrandAssetRole, string>>;
};

export type BrandProfile = { id: string; workspace_id: string; internal_label: string; archived_at: string | null; created_at: string; updated_at: string };
export type BrandRevisionValidation = { valid: boolean; bindable: boolean; errors: string[]; verified_at: string | null; verification_version: string };
export type BrandProfileRevision = { id: string; workspace_id: string; profile_id: string; revision: number; rules: BrandRules; content_hash: string; state: "committed" | "ineligible" | "archived"; validation: BrandRevisionValidation; created_at: string };
export type BrandAsset = { id: string; workspace_id: string; profile_id: string; role: BrandAssetRole; internal_label: string; archived_at: string | null };
export type BrandAssetRevision = { id: string; workspace_id: string; asset_id: string; revision: number; role: BrandAssetRole; state: BrandAssetRevisionState; storage_bucket: string; storage_key: string; mime_type: string; bytes: number; content_hash: string | null; width: number | null; height: number | null; duration_ms: number | null; has_audio: boolean | null; operation_id: string; ready_at: string | null };
export type WorkspaceDefaultBrandProfile = { workspace_id: string; profile_id: string; selected_at: string };

export type WorkpieceBrandBinding = { id: string; workspace_id: string; workpiece_id: string; revision: number; state: "profile" | "disabled"; profile_id: string | null; profile_revision_id: string | null; profile_revision: number | null; profile_content_hash: string | null; asset_revision_ids: string[]; mutation_reason: "resolve_default" | "select_profile_revision" | "update_to_current_profile_revision" | "disable"; operation_id: string; previous_binding_id: string | null; created_at: string };
export type BrandBindingProjection = { schema_version: typeof BRAND_BINDING_PROJECTION_VERSION; active: WorkpieceBrandBinding; history: WorkpieceBrandBinding[]; verified_at: string };
export type BrandApplicationProvenance = { binding_id: string; binding_revision: number; profile_revision_id: string | null; profile_content_hash: string | null; asset_revision_ids: string[] };
export type BrandBindingResolutionResult = { disposition: "created_binding" | "existing_binding"; binding: WorkpieceBrandBinding };
export type BrandBindingMutation = { intent: "select_profile_revision" | "update_to_current_profile_revision" | "disable"; operation_id: string; expected_current_revision: number; profile_id?: string; profile_revision_id?: string };
export type BrandBindingMutationResult = { disposition: "created_revision" | "existing_operation" | "no_change" | "revision_conflict" | "target_not_bindable"; binding: WorkpieceBrandBinding | null; current_revision: number | null; message: string | null };

export function canonicalBrandContent(rules: BrandRules): BrandRules {
  return structuredClone(rules);
}

export function validateBrandRules(rules: BrandRules): string[] {
  const errors:string[]=[]; const color=/^#[0-9a-f]{6}$/i;
  if(!rules.public_identity.program_name.trim())errors.push("Public program name is required.");
  for(const [key,value] of Object.entries(rules.palette))if(!color.test(value))errors.push(`${key} color must be a six-digit hex value.`);
  if(!rules.typography.heading_family.trim()||!rules.typography.body_family.trim())errors.push("Basic heading and body typography are required.");
  if(rules.audio.music_volume<0||rules.audio.music_volume>1||rules.audio.ducking<0||rules.audio.ducking>1)errors.push("Audio volume and ducking must be between zero and one.");
  if(rules.logo.watermark_opacity<0||rules.logo.watermark_opacity>1)errors.push("Watermark opacity must be between zero and one.");
  return errors;
}
