import { useCallback, useEffect, useRef, useState } from "react";
import { readWorkpieceProductionArtifact } from "../../lib/hearth-production-repo";
import {
  parseReleasePrepPackSections,
  type ReleasePrepSection,
} from "../../lib/hearth-release-prep-pack";

type ReleasePrepLoadState = "idle" | "loading" | "ready" | "missing" | "error";

type UseReleasePrepPackWorkspaceArgs = {
  workpieceId: string | null;
  hasApprovedScript: boolean;
  approvedScriptVersion: number | null;
};

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function useReleasePrepPackWorkspace(args: UseReleasePrepPackWorkspaceArgs) {
  const [latestReleasePrepRawText, setLatestReleasePrepRawText] = useState<string | null>(null);
  const [latestReleasePrepSections, setLatestReleasePrepSections] = useState<ReleasePrepSection[]>([]);
  const [releasePrepLoadState, setReleasePrepLoadState] = useState<ReleasePrepLoadState>("idle");
  const [releasePrepScriptVersion, setReleasePrepScriptVersion] = useState<number | null>(null);
  const loadRequestSeqRef = useRef(0);

  const resetReleasePrepState = useCallback(() => {
    setLatestReleasePrepRawText(null);
    setLatestReleasePrepSections([]);
    setReleasePrepLoadState("idle");
    setReleasePrepScriptVersion(null);
  }, []);

  const loadLatestReleasePrepPack = useCallback(async (scriptVersion: number) => {
    const episodeId = args.workpieceId?.trim() ?? "";
    if (!episodeId || !Number.isFinite(scriptVersion) || scriptVersion <= 0) {
      resetReleasePrepState();
      return;
    }

    const requestSeq = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestSeq;

    setReleasePrepLoadState("loading");
    const loaded = await readWorkpieceProductionArtifact({
      workpieceId: episodeId,
      scriptVersion,
      kind: "pack",
    });
    if (loadRequestSeqRef.current !== requestSeq || (args.workpieceId?.trim() ?? "") !== episodeId) return;

    if (!loaded.ok) {
      setLatestReleasePrepRawText(null);
      setLatestReleasePrepSections([]);
      setReleasePrepLoadState(loaded.reason === "not_found" ? "missing" : "error");
      setReleasePrepScriptVersion(scriptVersion);
      return;
    }

    const payload = loaded.payload;
    const rawText = (
      typeof payload === "object" && payload && !Array.isArray(payload)
        ? readTrimmedString((payload as Record<string, unknown>).raw_text)
        : null
    ) ?? "";
    setLatestReleasePrepRawText(rawText || null);
    setLatestReleasePrepSections(parseReleasePrepPackSections(rawText));
    setReleasePrepLoadState("ready");
    setReleasePrepScriptVersion(scriptVersion);
  }, [args.workpieceId, resetReleasePrepState]);

  useEffect(() => {
    resetReleasePrepState();
  }, [args.workpieceId, resetReleasePrepState]);

  useEffect(() => {
    if (!args.hasApprovedScript || !args.approvedScriptVersion) {
      resetReleasePrepState();
      return;
    }
    // Framing Pack is durable versioned workpiece state. A reload must hydrate
    // it without requiring the user to press Refresh or regenerate it.
    void loadLatestReleasePrepPack(args.approvedScriptVersion);
  }, [args.approvedScriptVersion, args.hasApprovedScript, loadLatestReleasePrepPack, resetReleasePrepState]);

  return {
    latestReleasePrepRawText,
    latestReleasePrepSections,
    releasePrepLoadState,
    releasePrepScriptVersion,
    loadLatestReleasePrepPack,
    resetReleasePrepState,
  };
}
