export type HammerMediaAvailability = "available" | "missing" | "unavailable" | "fingerprint_mismatch";
export type HammerMediaRole = "program_video" | "program_audio" | "camera" | "music" | "broll" | "image" | "intro" | "outro" | "graphic";

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
