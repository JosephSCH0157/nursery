import { HAMMER_RUNTIME_WRITTEN_BY } from "../prep/hammerPrep";
import { tongsFetch } from "./tongsFetch";
import {
  HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH,
  HAMMER_QUENCH_RELEASE_PACKET_VTT_PATH,
  type HammerQuenchReleasePacketArtifacts,
} from "./hammerQuenchReleasePacket";

type ReleasePacketSaveResult =
  | { ok: true; status: number }
  | { ok: false; status: number; error: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

async function commitTextFile(args: {
  workpieceId: string;
  path: string;
  content: string;
  contentType: string;
}): Promise<void> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: args.path,
        content_type: args.contentType,
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        text: args.content,
      },
      timeoutMs: 45_000,
    },
  );
  if (!response.ok) {
    throw new Error(`Hammer could not save ${args.path}.`);
  }
}

async function commitJsonFile(args: {
  workpieceId: string;
  path: string;
  payload: unknown;
}): Promise<void> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/commit-file`,
    {
      method: "POST",
      json: {
        path: args.path,
        content_type: "application/json",
        written_by: { ...HAMMER_RUNTIME_WRITTEN_BY },
        json: args.payload,
      },
      timeoutMs: 45_000,
    },
  );
  if (!response.ok) {
    throw new Error(`Hammer could not save ${args.path}.`);
  }
}

export async function saveHammerQuenchReleasePacket(args: {
  workpieceId: string;
  packet: HammerQuenchReleasePacketArtifacts;
}): Promise<ReleasePacketSaveResult> {
  if (args.packet.manifest.packaging_media_readiness.state !== "ready"
    || args.packet.visuals.some((placement) => placement.media_reference.state !== "validated")) {
    return { ok: false, status: 422, error: "Release packet contains unresolved production media." };
  }
  try {
    if (args.packet.transcriptText) {
      await commitTextFile({
        workpieceId: args.workpieceId,
        path: HAMMER_QUENCH_RELEASE_PACKET_TRANSCRIPT_PATH,
        content: args.packet.transcriptText,
        contentType: "text/plain; charset=utf-8",
      });
    }
    if (args.packet.srtText) {
      await commitTextFile({
        workpieceId: args.workpieceId,
        path: HAMMER_QUENCH_RELEASE_PACKET_SRT_PATH,
        content: args.packet.srtText,
        contentType: "text/plain; charset=utf-8",
      });
    }
    if (args.packet.vttText) {
      await commitTextFile({
        workpieceId: args.workpieceId,
        path: HAMMER_QUENCH_RELEASE_PACKET_VTT_PATH,
        content: args.packet.vttText,
        contentType: "text/plain; charset=utf-8",
      });
    }

    await commitJsonFile({
      workpieceId: args.workpieceId,
      path: HAMMER_QUENCH_RELEASE_PACKET_VISUALS_PATH,
      payload: args.packet.visuals,
    });

    await commitJsonFile({
      workpieceId: args.workpieceId,
      path: HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH,
      payload: args.packet.manifest,
    });
  } catch (error) {
    return {
      ok: false,
      status: 500,
      error: toErrorMessage(error, "Hammer could not save the Quench release packet."),
    };
  }

  let verify: Response;
  try {
    verify = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/read-file?path=${encodeURIComponent(HAMMER_QUENCH_RELEASE_PACKET_MANIFEST_PATH)}`,
      {
        method: "GET",
        timeoutMs: 30_000,
      },
    );
  } catch {
    return {
      ok: false,
      status: 500,
      error: "Hammer saved the Quench release packet but could not verify the manifest.",
    };
  }

  if (!verify.ok) {
    return {
      ok: false,
      status: verify.status,
      error: "Hammer saved the Quench release packet but could not verify the manifest.",
    };
  }

  const payload = await verify.json().catch(() => null);
  const row = readObject(payload);
  if (row?.exists !== true) {
    return {
      ok: false,
      status: verify.status,
      error: readString(readObject(row?.error)?.message) ?? "Hammer could not verify the Quench release packet manifest.",
    };
  }

  return {
    ok: true,
    status: verify.status,
  };
}
