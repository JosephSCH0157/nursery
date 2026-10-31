import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const BETA_APPLICATION_FORM_NAME = "anvil-beta-application";
export const ACCOUNT_ADMISSION_AUTHORITY_VERSION = "forge-account-admission-v1";
export const BETA_ADMISSION_INTAKE_FLAG = "FORGE_BETA_INTAKE_ENABLED";

export type VerifiedBetaApplicationEventData = Record<string, string | undefined>;

export type BetaAdmissionRpcClient = {
  schema: (schema: "tongs") => {
    rpc: (
      fn: "account_admission_authority_version" | "ingest_beta_access_application",
      args?: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

export function isBetaAdmissionIntakeEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return environment[BETA_ADMISSION_INTAKE_FLAG]?.trim().toLowerCase() === "true";
}

export type NormalizedBetaApplication = {
  sourceReference: string;
  email: string;
  name: string;
  creatorType: string;
  frequency: string;
  goals: string;
  teleprompterUsed: string | null;
  frustrations: string | null;
  notes: string | null;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requiredField(data: VerifiedBetaApplicationEventData, name: string, maximum: number): string {
  const value = data[name]?.trim() ?? "";
  if (!value || value.length > maximum) {
    throw new Error(`Invalid beta application field: ${name}`);
  }
  return value;
}

function optionalField(data: VerifiedBetaApplicationEventData, name: string, maximum: number): string | null {
  const value = data[name]?.trim() ?? "";
  if (value.length > maximum) {
    throw new Error(`Invalid beta application field: ${name}`);
  }
  return value || null;
}

export function normalizeVerifiedBetaApplication(
  data: VerifiedBetaApplicationEventData,
): NormalizedBetaApplication {
  if (data["form-name"] !== BETA_APPLICATION_FORM_NAME) {
    throw new Error("Unsupported Netlify form submission");
  }

  const sourceReference = requiredField(data, "application_ref", 36);
  if (!UUID_PATTERN.test(sourceReference)) {
    throw new Error("Invalid beta application reference");
  }

  const email = requiredField(data, "email", 320).toLowerCase();
  if (!email.includes("@")) {
    throw new Error("Invalid beta application email");
  }

  return {
    sourceReference: sourceReference.toLowerCase(),
    email,
    name: requiredField(data, "name", 200),
    creatorType: requiredField(data, "creator_type", 120),
    frequency: requiredField(data, "frequency", 120),
    goals: requiredField(data, "goals", 5000),
    teleprompterUsed: optionalField(data, "teleprompter_used", 1000),
    frustrations: optionalField(data, "frustrations", 5000),
    notes: optionalField(data, "notes", 5000),
  };
}

export function betaApplicationPayloadSha256(application: NormalizedBetaApplication): string {
  const canonicalPayload = JSON.stringify({
    source_reference: application.sourceReference,
    email: application.email,
    name: application.name,
    creator_type: application.creatorType,
    frequency: application.frequency,
    goals: application.goals,
    teleprompter_used: application.teleprompterUsed,
    frustrations: application.frustrations,
    notes: application.notes,
  });
  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}

export async function ingestVerifiedBetaApplication(
  data: VerifiedBetaApplicationEventData,
  client: BetaAdmissionRpcClient,
  submittedAt = new Date(),
): Promise<void> {
  const application = normalizeVerifiedBetaApplication(data);
  const payloadSha256 = betaApplicationPayloadSha256(application);
  const tongs = client.schema("tongs");
  const versionResult = await tongs.rpc("account_admission_authority_version");
  if (versionResult.error) throw versionResult.error;
  if (versionResult.data !== ACCOUNT_ADMISSION_AUTHORITY_VERSION) {
    throw new Error("Forge account-admission database dependency is unavailable");
  }
  const { error } = await tongs.rpc("ingest_beta_access_application", {
    p_source_reference: application.sourceReference,
    p_payload_sha256: payloadSha256,
    p_email: application.email,
    p_name: application.name,
    p_creator_type: application.creatorType,
    p_frequency: application.frequency,
    p_goals: application.goals,
    p_teleprompter_used: application.teleprompterUsed,
    p_frustrations: application.frustrations,
    p_notes: application.notes,
    p_submitted_at: submittedAt.toISOString(),
  });
  if (error) throw error;
}

function requiredEnvironment(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing server configuration: ${names.join(" or ")}`);
}

let serviceClient: BetaAdmissionRpcClient | null = null;

export function getBetaAdmissionServiceClient(): BetaAdmissionRpcClient {
  serviceClient ??= createClient(
    requiredEnvironment("TONGS_SUPABASE_URL", "SUPABASE_URL"),
    requiredEnvironment("TONGS_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  ) as unknown as BetaAdmissionRpcClient;
  return serviceClient;
}

