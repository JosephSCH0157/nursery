import type {
  HammerMediaResolver,
  MediaRef,
  ResolveDiagnostics,
  ResolveMediaOptions,
  ResolveMediaResult,
  ResolveNextAction,
  ResolveUnresolvedReason,
  WorkspaceMediaMapping,
} from "../../../../packages/contracts/hammer/media-resolver.contract";

type LocalProbeFn = (absolutePath: string) => Promise<boolean>;

export interface ResolveMediaRuntimeDeps {
  /**
   * Optional local filesystem probe. In browser-only environments this may be omitted.
   */
  probeLocalPath?: LocalProbeFn;
}

const DEFAULT_OPTIONS: Required<Pick<ResolveMediaOptions, "cloud_enabled" | "allow_probe" | "verify_hash">> = {
  cloud_enabled: false,
  allow_probe: true,
  verify_hash: false,
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildLocalAbsolutePath(localRootAbs: string, localRelpath: string): string | null {
  const root = normalizeString(localRootAbs);
  const rel = normalizeString(localRelpath);
  if (!root || !rel) return null;

  // Absolute relpath would escape workspace mapping and is not allowed.
  if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith("/") || rel.startsWith("\\")) {
    return null;
  }

  const normalizedRel = rel.replace(/\\/g, "/");
  const segments = normalizedRel.split("/").filter(Boolean);
  if (!segments.length) return null;
  if (segments.some((seg) => seg === "." || seg === "..")) return null;

  const rootNoTrailing = root.replace(/[\\/]+$/, "");
  const sep = rootNoTrailing.includes("\\") ? "\\" : "/";
  return `${rootNoTrailing}${sep}${segments.join(sep)}`;
}

function unresolved(
  ref: MediaRef,
  reason: ResolveUnresolvedReason,
  userMessage: string,
  nextAction: ResolveNextAction,
  diagnostics?: ResolveDiagnostics,
): ResolveMediaResult {
  return {
    status: "unresolved",
    media_id: ref.media_id,
    kind: ref.kind,
    reason,
    user_message: userMessage,
    next_action: nextAction,
    diagnostics,
  };
}

async function probeExists(probeFn: LocalProbeFn | undefined, absolutePath: string): Promise<boolean | null> {
  if (!probeFn) return null;
  return probeFn(absolutePath);
}

export class V1HammerMediaResolver implements HammerMediaResolver {
  private readonly deps: ResolveMediaRuntimeDeps;

  constructor(deps: ResolveMediaRuntimeDeps = {}) {
    this.deps = deps;
  }

  async resolveMedia(
    workspaceMapping: WorkspaceMediaMapping | null,
    ref: MediaRef,
    opts?: ResolveMediaOptions,
  ): Promise<ResolveMediaResult> {
    const options = {
      ...DEFAULT_OPTIONS,
      ...(opts || {}),
    };

    if (!workspaceMapping) {
      return unresolved(
        ref,
        "NO_WORKSPACE_MAPPING",
        "No workspace media mapping is configured on this machine.",
        "OPEN_WORKSPACE_SETTINGS",
      );
    }

    const notes: string[] = [];
    const localRelpath = normalizeString(ref.local_relpath);
    if (localRelpath) {
      const attemptedLocalAbs = buildLocalAbsolutePath(workspaceMapping.local_root_abs, localRelpath);
      if (!attemptedLocalAbs) {
        return unresolved(
          ref,
          "PERMISSION_DENIED",
          "Local media path is invalid for this workspace mapping.",
          "RELINK_MEDIA",
          { attempted_local_abs: normalizeString(ref.local_relpath), checked_exists: false },
        );
      }

      if (options.allow_probe) {
        try {
          const exists = await probeExists(this.deps.probeLocalPath, attemptedLocalAbs);
          if (exists === false) {
            return unresolved(
              ref,
              "MISSING_LOCAL_FILE",
              "Media file is missing from the mapped local workspace folder.",
              "RELINK_MEDIA",
              {
                attempted_local_abs: attemptedLocalAbs,
                checked_exists: true,
              },
            );
          }
          if (exists === null) {
            notes.push("local_probe_not_available");
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return unresolved(
            ref,
            "PERMISSION_DENIED",
            "Could not access local media due to permissions.",
            "RETRY",
            {
              attempted_local_abs: attemptedLocalAbs,
              checked_exists: true,
              notes: [`probe_error:${message}`],
            },
          );
        }
      } else {
        notes.push("local_probe_skipped");
      }

      return {
        status: "ok",
        media_id: ref.media_id,
        kind: ref.kind,
        playable_uri: attemptedLocalAbs,
        byte_size: ref.byte_size,
        duration_ms: ref.duration_ms,
        sha256: ref.sha256,
        diagnostics: {
          attempted_local_abs: attemptedLocalAbs,
          checked_exists: options.allow_probe,
          notes: notes.length ? notes : undefined,
        },
      };
    }

    const cloudUri = normalizeString(ref.cloud_uri);
    if (cloudUri) {
      if (!options.cloud_enabled) {
        return unresolved(
          ref,
          "CLOUD_DISABLED",
          "This media is cloud-only and cloud media is disabled in V1.",
          "ENABLE_CLOUD_MEDIA",
          {
            attempted_cloud_uri: cloudUri,
            checked_exists: false,
          },
        );
      }

      return unresolved(
        ref,
        "CLOUD_UNREACHABLE",
        "Cloud media resolution is not enabled for this build.",
        "RETRY",
        {
          attempted_cloud_uri: cloudUri,
          checked_exists: false,
          notes: ["cloud_resolution_not_implemented_v1"],
        },
      );
    }

    return unresolved(
      ref,
      "NO_USABLE_POINTER",
      "No usable local or cloud media pointer was found.",
      "RELINK_MEDIA",
      { checked_exists: false },
    );
  }
}

export const hammerMediaResolver = new V1HammerMediaResolver();
