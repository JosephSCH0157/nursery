import type { Config, Context } from "@netlify/functions";

import { HAMMER_TRANSCRIPT_PREP_ROUTE } from "../../../hammer/src/prep/hammerPrepApi";
import { createNetlifyHammerFunction } from "../_hammer-handler";

const execute = createNetlifyHammerFunction({ hammerAssemblyAiExecutionMode: "background" });

type AcceptedBackgroundRequest = {
  quoteId: string;
  operationUuid: string;
  requestFingerprint: string;
};

function readAcceptedBackgroundRequest(body: ArrayBuffer): AcceptedBackgroundRequest {
  const parsed = JSON.parse(new TextDecoder().decode(body)) as {
    spending_acceptance?: {
      quote_id?: unknown;
      operation_id?: unknown;
      request_fingerprint?: unknown;
    };
  };
  const acceptance = parsed.spending_acceptance;
  const operationId = typeof acceptance?.operation_id === "string" ? acceptance.operation_id : "";
  const operationUuid = operationId.match(/^hammer-assemblyai:([0-9a-f-]{36})$/i)?.[1] ?? "";
  const quoteId = typeof acceptance?.quote_id === "string" ? acceptance.quote_id : "";
  const requestFingerprint = typeof acceptance?.request_fingerprint === "string"
    ? acceptance.request_fingerprint
    : "";
  if (!quoteId || !operationUuid || !/^[0-9a-f]{64}$/.test(requestFingerprint)) {
    throw new Error("Hammer background execution requires an exact accepted request identity.");
  }
  return { quoteId, operationUuid, requestFingerprint };
}

async function recordPreoperationReceipt(
  accepted: AcceptedBackgroundRequest,
  stage: "background_started" | "pre_admission_failed",
  failureCode: string | null = null,
): Promise<void> {
  const supabaseUrl = process.env.TONGS_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.TONGS_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Hammer background receipt authority is unavailable.");
  }
  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/record_hammer_transcription_preoperation_receipt`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      p_quote_id: accepted.quoteId,
      p_operation_uuid: accepted.operationUuid,
      p_request_fingerprint: accepted.requestFingerprint,
      p_stage: stage,
      p_failure_code: failureCode,
      p_evidence_json: { provider_transmitted: false },
    }),
  });
  if (!response.ok) {
    throw new Error(`Hammer background receipt failed (${response.status}).`);
  }
}

export default async function hammerTranscriptionBackground(
  request: Request,
  context: Context,
): Promise<void> {
  const body = await request.arrayBuffer();
  const accepted = readAcceptedBackgroundRequest(body);
  await recordPreoperationReceipt(accepted, "background_started");
  const target = new URL(HAMMER_TRANSCRIPT_PREP_ROUTE, request.url);
  const forwarded = new Request(target, {
    method: "POST",
    headers: request.headers,
    body,
  });
  let response: Response;
  try {
    response = await execute(forwarded, context);
  } catch (error) {
    await recordPreoperationReceipt(accepted, "pre_admission_failed", "background_execution_exception");
    throw error;
  }
  if (!response.ok && response.status !== 202) {
    const payload = await response.clone().json().catch(() => null) as { error?: { code?: unknown } } | null;
    const code = typeof payload?.error?.code === "string" ? payload.error.code : `http_${response.status}`;
    await recordPreoperationReceipt(accepted, "pre_admission_failed", code);
    throw new Error(`Hammer transcription background execution failed (${response.status}).`);
  }
}

export const config: Config = { background: true };
