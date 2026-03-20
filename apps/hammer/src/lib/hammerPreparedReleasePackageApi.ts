import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";
import {
  HAMMER_PREPARED_RELEASE_PACKAGE_PATH,
  type HammerPreparedReleasePackage,
} from "./hammerPreparedReleasePackage";

type PreparedReleasePackageResult<T> =
  | { ok: true; status: number; exists: boolean; data: T | null }
  | { ok: false; status: number; error: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function normalizePreparedReleasePackage(value: unknown): HammerPreparedReleasePackage | null {
  const row = readJsonObject(value);
  if (!row) return null;
  return row as unknown as HammerPreparedReleasePackage;
}

export async function loadHammerPreparedReleasePackage(
  workpieceId: string,
): Promise<PreparedReleasePackageResult<HammerPreparedReleasePackage>> {
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_PREPARED_RELEASE_PACKAGE_PATH)}`,
      {
        method: "GET",
        timeoutMs: 30_000,
      },
    );
  } catch (error) {
    return {
      ok: false,
      status: 504,
      error: toErrorMessage(error, "Hammer could not load the prepared release package."),
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const row = readJsonObject(payload);
    return {
      ok: false,
      status: response.status,
      error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not load the prepared release package.",
    };
  }

  const root = readJsonObject(payload);
  const exists = root?.exists === true;
  const data = normalizePreparedReleasePackage(root?.data);
  return {
    ok: true,
    status: response.status,
    exists,
    data: exists ? data : null,
  };
}

export async function saveHammerPreparedReleasePackage(args: {
  workpieceId: string;
  pkg: HammerPreparedReleasePackage;
  subtitles?: {
    srt?: string | null;
    vtt?: string | null;
  };
}): Promise<PreparedReleasePackageResult<HammerPreparedReleasePackage>> {
  const commitSubtitle = async (
    path: string | null,
    content: string | null | undefined,
  ): Promise<void> => {
    if (!path || !content) return;
    const response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path,
          content_type: "text/plain; charset=utf-8",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          text: content,
        },
        timeoutMs: 45_000,
      },
    );
    if (!response.ok) {
      throw new Error("Hammer could not save prepared subtitle artifacts.");
    }
  };

  try {
    await commitSubtitle(args.pkg.subtitles.srt.artifactPath, args.subtitles?.srt ?? null);
    await commitSubtitle(args.pkg.subtitles.vtt.artifactPath, args.subtitles?.vtt ?? null);

    const response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
      {
        method: "POST",
        json: {
          path: HAMMER_PREPARED_RELEASE_PACKAGE_PATH,
          content_type: "application/json",
          written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
          json: args.pkg,
        },
        timeoutMs: 45_000,
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const row = readJsonObject(payload);
      return {
        ok: false,
        status: response.status,
        error: readString(readJsonObject(row?.error)?.message) ?? "Hammer could not save the prepared release package.",
      };
    }
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save the prepared release package."),
    };
  }

  return {
    ok: true,
    status: 200,
    exists: true,
    data: args.pkg,
  };
}
