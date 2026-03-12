export interface HammerVisualPackageScriptAnchor {
  section_id: string;
  paragraph_id: string;
  paragraph_order: number;
  sentence_start: number;
  sentence_end: number;
  char_start: number;
  char_end: number;
  span_text: string;
  speaker_block_id?: string | null;
}

export interface HammerVisualPackageSelectedAsset {
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
}

export interface HammerVisualPackageVisual {
  entry_id: string;
  beat_order: number;
  paragraph_beat_order: number;
  status: string;
  script_anchor: HammerVisualPackageScriptAnchor | null;
  visual_mode: string | null;
  selected_asset_id: string | null;
  selected_asset: HammerVisualPackageSelectedAsset | null;
}

export interface HammerVisualPackage {
  workspace_id: string;
  workpiece_id: string;
  script_path: string | null;
  script_updated_at: string | null;
  image_map_updated_at: string | null;
  image_map_asset_updated_at: string | null;
  visuals: HammerVisualPackageVisual[];
}
