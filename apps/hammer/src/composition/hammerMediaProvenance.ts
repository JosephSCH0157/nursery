export type HammerMediaAvailability = "available" | "missing" | "unavailable" | "fingerprint_mismatch";
export type HammerMediaRole = "program_video" | "program_audio" | "camera" | "music" | "broll" | "image" | "intro" | "outro" | "graphic";
export type HammerDerivedArtifactKind = "proxy" | "waveform" | "thumbnail" | "analysis" | "render_intermediate";

export type HammerMediaProvenance = Readonly<{
  schema_version: 1;
  media_id: string;
  canonical_asset_id: string | null;
  role: HammerMediaRole;
  content_fingerprint: string;
  canonical_path: string;
  mime_type: string | null;
  duration_ms: number | null;
  availability: HammerMediaAvailability;
  relinked_from_path: string | null;
  derived_from_fingerprint: string | null;
  generator_version: string | null;
}>;

export type HammerRelinkDecision =
  | Readonly<{ kind: "accepted"; provenance: HammerMediaProvenance }>
  | Readonly<{ kind: "refused"; reason: "identity_mismatch" | "fingerprint_mismatch" | "candidate_unavailable" }>;

export type HammerDerivedArtifact = Readonly<{
  schema_version: 1;
  artifact_id: string;
  source_media_id: string;
  source_fingerprint: string;
  kind: HammerDerivedArtifactKind;
  generator_version: string;
  canonical_asset_id: string;
  canonical_path: string;
  availability: "available" | "missing" | "unavailable";
}>;

export type HammerMediaProvenanceManifest = Readonly<{
  schema_version: 1;
  recording_revision_id: string;
  sources: readonly HammerMediaProvenance[];
  derived_artifacts: readonly HammerDerivedArtifact[];
}>;

export type HammerMediaDiagnostic = Readonly<{
  media_id: string;
  severity: "blocking" | "warning";
  code: "media_missing" | "media_unavailable" | "media_fingerprint_mismatch";
  relink_allowed: boolean;
}>;

export function diagnoseHammerMedia(provenance: readonly HammerMediaProvenance[]): readonly HammerMediaDiagnostic[] {
  return provenance.flatMap((source) => {
    if (source.availability === "available") return [];
    const code = source.availability === "missing"
      ? "media_missing" as const
      : source.availability === "unavailable"
        ? "media_unavailable" as const
        : "media_fingerprint_mismatch" as const;
    return [Object.freeze({ media_id: source.media_id, severity: "blocking" as const, code, relink_allowed: true })];
  });
}

export function hammerDerivedArtifactKey(args: Pick<HammerDerivedArtifact, "source_fingerprint" | "kind" | "generator_version">): string {
  return `${args.source_fingerprint}:${args.kind}:${args.generator_version}`;
}

export function registerHammerDerivedArtifact(args: {
  source: HammerMediaProvenance;
  artifact: HammerDerivedArtifact;
}): HammerDerivedArtifact {
  if (args.artifact.source_media_id !== args.source.media_id) throw new Error("derived_artifact_source_identity_mismatch");
  if (args.artifact.source_fingerprint !== args.source.content_fingerprint) throw new Error("derived_artifact_source_fingerprint_mismatch");
  if (!args.artifact.generator_version.trim()) throw new Error("derived_artifact_generator_version_missing");
  return Object.freeze({ ...args.artifact });
}

export function selectCurrentHammerDerivedArtifact(args: {
  source: HammerMediaProvenance;
  artifacts: readonly HammerDerivedArtifact[];
  kind: HammerDerivedArtifactKind;
  generatorVersion: string;
}): HammerDerivedArtifact | null {
  return args.artifacts.find((artifact) => artifact.source_media_id === args.source.media_id
    && artifact.source_fingerprint === args.source.content_fingerprint
    && artifact.kind === args.kind
    && artifact.generator_version === args.generatorVersion
    && artifact.availability === "available") ?? null;
}

export type HammerResolvedMediaSource = Readonly<{
  media_id: string;
  canonical_fingerprint: string;
  selected_path: string;
  selected_artifact_id: string | null;
  provider: "canonical_source" | "derived_proxy";
}>;

export function resolveHammerMediaSource(args: {
  source: HammerMediaProvenance;
  consumer: "preview" | "render";
  derivedArtifacts?: readonly HammerDerivedArtifact[];
  proxyGeneratorVersion?: string;
}): HammerResolvedMediaSource {
  if (args.source.availability !== "available") throw new Error(`media_${args.source.availability}`);
  const proxy = args.consumer === "preview" && args.proxyGeneratorVersion
    ? selectCurrentHammerDerivedArtifact({ source: args.source, artifacts: args.derivedArtifacts ?? [], kind: "proxy", generatorVersion: args.proxyGeneratorVersion })
    : null;
  return Object.freeze({
    media_id: args.source.media_id,
    canonical_fingerprint: args.source.content_fingerprint,
    selected_path: proxy?.canonical_path ?? args.source.canonical_path,
    selected_artifact_id: proxy?.canonical_asset_id ?? args.source.canonical_asset_id,
    provider: proxy ? "derived_proxy" : "canonical_source",
  });
}

export function evaluateHammerMediaRelink(args: {
  current: HammerMediaProvenance;
  candidatePath: string;
  candidateFingerprint: string;
  candidateAvailable: boolean;
}): HammerRelinkDecision {
  if (!args.candidateAvailable) return { kind: "refused", reason: "candidate_unavailable" };
  if (!args.current.media_id.trim()) return { kind: "refused", reason: "identity_mismatch" };
  if (args.candidateFingerprint !== args.current.content_fingerprint) return { kind: "refused", reason: "fingerprint_mismatch" };
  return {
    kind: "accepted",
    provenance: Object.freeze({
      ...args.current,
      canonical_path: args.candidatePath,
      availability: "available",
      relinked_from_path: args.current.canonical_path,
    }),
  };
}

export function isHammerDerivedArtifactCurrent(args: {
  source: HammerMediaProvenance;
  derived: HammerMediaProvenance;
  generatorVersion: string;
}): boolean {
  return args.derived.derived_from_fingerprint === args.source.content_fingerprint
    && args.derived.generator_version === args.generatorVersion
    && args.derived.availability === "available";
}
