const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HandoffEpisodeSummary = {
  id: string;
  workspace_id: string;
  archived_at?: string | null;
};

export type AnvilHandoffSearchContext = {
  scriptPath: string | null;
  hasInvalidScriptPath: boolean;
  openTarget: string | null;
};

export type AnvilHandoffValidationResult =
  | {
    ok: true;
    workspaceId: string;
    workpieceId: string;
    scriptPath: string | null;
  }
  | {
    ok: false;
    code:
      | "invalid_context"
      | "invalid_script_path"
      | "workpiece_missing"
      | "archived"
      | "script_missing"
      | "request_failed";
    message: string;
  };

type ValidateAnvilHandoffArgs = {
  workspaceId: string;
  workpieceId: string;
  scriptPath: string | null;
  listEpisodes: (workspaceId: string) => Promise<HandoffEpisodeSummary[]>;
  readTextFile: (workpieceId: string, path: string) => Promise<{ exists: boolean }>;
};

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function normalizeUuid(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  return UUID_RE.test(candidate) ? candidate.toLowerCase() : null;
}

export function normalizeHandoffScriptPath(value: unknown): string | null {
  const candidate = readString(value);
  if (!candidate) return null;
  if (candidate.startsWith("/") || candidate.startsWith("\\")) return null;
  if (candidate.includes("..") || candidate.includes("\\")) return null;
  return candidate;
}

export function parseAnvilHandoffSearch(search: string): AnvilHandoffSearchContext {
  const params = new URLSearchParams(search);
  const openTarget = readString(params.get("open"));
  const rawScriptPath = readString(params.get("script_path"));
  return {
    scriptPath: normalizeHandoffScriptPath(rawScriptPath),
    hasInvalidScriptPath: Boolean(rawScriptPath && !normalizeHandoffScriptPath(rawScriptPath)),
    openTarget,
  };
}

export async function validateAnvilHandoffTarget(
  args: ValidateAnvilHandoffArgs,
): Promise<AnvilHandoffValidationResult> {
  const workspaceId = normalizeUuid(args.workspaceId);
  const workpieceId = normalizeUuid(args.workpieceId);
  const scriptPath = args.scriptPath == null ? null : normalizeHandoffScriptPath(args.scriptPath);

  if (!workspaceId || !workpieceId) {
    return {
      ok: false,
      code: "invalid_context",
      message: "Open in Anvil requires a valid workspace and workpiece.",
    };
  }

  if (args.scriptPath != null && !scriptPath) {
    return {
      ok: false,
      code: "invalid_script_path",
      message: "The requested script path is invalid. Reopen the script from Hearth.",
    };
  }

  let episodes: HandoffEpisodeSummary[];
  try {
    episodes = await args.listEpisodes(workspaceId);
  } catch {
    return {
      ok: false,
      code: "request_failed",
      message: "Unable to validate the requested workpiece. Try reopening it from Hearth.",
    };
  }

  const episode = episodes.find((row) => normalizeUuid(row.id) === workpieceId) ?? null;
  if (!episode) {
    return {
      ok: false,
      code: "workpiece_missing",
      message: "The requested workpiece is no longer available in this workspace. Reopen it from Hearth.",
    };
  }

  if (readString(episode.archived_at)) {
    return {
      ok: false,
      code: "archived",
      message: "This workpiece is archived. Restore it in Hearth before opening in Anvil.",
    };
  }

  if (scriptPath) {
    let scriptResult: { exists: boolean };
    try {
      scriptResult = await args.readTextFile(workpieceId, scriptPath);
    } catch {
      return {
        ok: false,
        code: "request_failed",
        message: "Unable to validate the requested script. Try reopening it from Hearth.",
      };
    }
    if (!scriptResult.exists) {
      return {
        ok: false,
        code: "script_missing",
        message: "The requested script is no longer available. Reopen it from Hearth before recording.",
      };
    }
  }

  return {
    ok: true,
    workspaceId,
    workpieceId,
    scriptPath,
  };
}
