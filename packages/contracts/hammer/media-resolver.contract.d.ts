export type MediaKind = "recording_video" | "recording_audio" | "export_video" | "export_audio" | "asset_image" | "asset_broll" | "asset_audio" | "other";
export type MediaSourceHint = "local" | "cloud" | "unknown";
/**
 * MediaRef is a canonical pointer object stored in Tongs metadata.
 * V1: local_relpath should exist for large media bytes.
 * Future: cloud_uri becomes resolvable when cloud media is enabled.
 */
export interface MediaRef {
    media_id: string;
    kind: MediaKind;
    source_hint?: MediaSourceHint;
    local_relpath?: string;
    byte_size?: number;
    sha256?: string;
    duration_ms?: number;
    cloud_uri?: string;
}
export interface WorkspaceMediaMapping {
    workspace_id: string;
    /**
     * Logical media root for THIS machine.
     * Examples:
     * - Windows: "D:\\ForgeMedia\\ws_<id>"
     * - macOS:   "/Volumes/ForgeMedia/ws_<id>"
     */
    local_root_abs: string;
    machine_id?: string;
}
export type ResolveUnresolvedReason = "NO_WORKSPACE_MAPPING" | "NO_USABLE_POINTER" | "MISSING_LOCAL_FILE" | "CLOUD_DISABLED" | "CLOUD_UNREACHABLE" | "PERMISSION_DENIED" | "UNKNOWN";
export interface ResolveDiagnostics {
    attempted_local_abs?: string;
    attempted_cloud_uri?: string;
    checked_exists?: boolean;
    notes?: string[];
}
export type ResolveNextAction = "OPEN_WORKSPACE_SETTINGS" | "RELINK_MEDIA" | "ENABLE_CLOUD_MEDIA" | "RETRY" | "NONE";
export interface ResolvedMediaOk {
    status: "ok";
    media_id: string;
    kind: MediaKind;
    playable_uri: string;
    byte_size?: number;
    duration_ms?: number;
    sha256?: string;
    diagnostics?: ResolveDiagnostics;
}
export interface ResolvedMediaUnresolved {
    status: "unresolved";
    media_id: string;
    kind: MediaKind;
    reason: ResolveUnresolvedReason;
    user_message: string;
    next_action: ResolveNextAction;
    diagnostics?: ResolveDiagnostics;
}
export type ResolveMediaResult = ResolvedMediaOk | ResolvedMediaUnresolved;
export interface ResolveMediaOptions {
    cloud_enabled?: boolean;
    allow_probe?: boolean;
    verify_hash?: boolean;
}
export interface HammerMediaResolver {
    resolveMedia(workspaceMapping: WorkspaceMediaMapping | null, ref: MediaRef, opts?: ResolveMediaOptions): Promise<ResolveMediaResult>;
}
//# sourceMappingURL=media-resolver.contract.d.ts.map