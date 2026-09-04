import { resolveTongsUserAccessToken, tongsFetch } from "./tongs-fetch";
import type { ReferenceReviewItem } from "./hearth-reference-review";

type Intent = "use_source" | "save_edits" | "replace" | "approve" | "skip";
type Authorization =
  | "not_applicable"
  | "standing_approved"
  | "standing_denied"
  | "explicitly_approved"
  | "explicitly_denied";
type Result<T> = { ok: true; data: T } | { ok: false; error: string };
export type ReferenceReviewFailure = {
  attemptId: string;
  key: string;
  intent: Intent;
  message: string;
};
const rec = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function body(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
async function hash(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (part) =>
    part.toString(16).padStart(2, "0"),
  ).join("");
}

const env = (name: string) => {
  const value = (import.meta as unknown as { env?: Record<string, string> })
    .env?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

export async function readReferenceReviewFailures(
  workspaceId: string,
  workpieceId: string,
): Promise<Result<ReferenceReviewFailure[]>> {
  const url = env("VITE_SUPABASE_URL");
  const anon = env("VITE_SUPABASE_ANON_KEY");
  const token = await resolveTongsUserAccessToken();
  if (!url || !anon || !token)
    return { ok: false, error: "Sign in to read review attempts." };
  const query = new URLSearchParams({
    workspace_id: `eq.${workspaceId}`,
    workpiece_id: `eq.${workpieceId}`,
    select:
      "attempt_id,media_family,intent_kind,opportunity_id,terminal_outcome,failure_message,created_at",
    order: "created_at.desc",
  });
  const response = await fetch(
    `${url}/rest/v1/reference_review_operation_attempts?${query}`,
    {
      headers: {
        apikey: anon,
        authorization: `Bearer ${token}`,
        "accept-profile": "tongs",
      },
    },
  );
  const value = await body(response);
  if (!response.ok || !Array.isArray(value))
    return { ok: false, error: "Tongs could not read review attempts." };
  const latest = new Map<string, ReferenceReviewFailure | null>();
  for (const row of value) {
    if (!rec(row)) continue;
    const family = row.media_family;
    const opportunityId = row.opportunity_id;
    if (
      (family !== "reference_clip" && family !== "reference_visual") ||
      typeof opportunityId !== "string"
    )
      continue;
    const key = `${family}:${opportunityId}`;
    if (latest.has(key)) continue;
    const intent = row.intent_kind;
    latest.set(
      key,
      row.terminal_outcome === "failed" &&
        typeof row.attempt_id === "string" &&
        (intent === "approve" ||
          intent === "skip" ||
          intent === "use_source" ||
          intent === "save_edits" ||
          intent === "replace")
        ? {
            attemptId: row.attempt_id,
            key,
            intent,
            message:
              typeof row.failure_message === "string"
                ? row.failure_message
                : "This operation failed.",
          }
        : null,
    );
  }
  return {
    ok: true,
    data: [...latest.values()].filter(
      (entry): entry is ReferenceReviewFailure => entry !== null,
    ),
  };
}

export async function startReferenceReviewAttempt(args: {
  workspaceId: string;
  workpieceId: string;
  item: ReferenceReviewItem;
  intent: Intent;
  parentAttemptId?: string | null;
  aiAuthorization?: Authorization;
}): Promise<Result<{ attemptId: string }>> {
  const operationId = `forge:reference-review:${crypto.randomUUID()}`,
    payload = {
      workspace_id: args.workspaceId,
      operation_id: operationId,
      media_family: args.item.family,
      intent_kind: args.intent,
      opportunity_id: args.item.opportunityId,
      expected_opportunity_revision_id: args.item.opportunityRevisionId,
      expected_plan_revision_id: args.item.planRevisionId,
      expected_revisions_json: {
        opportunity_revision: args.item.opportunityRevision,
        plan_revision: args.item.planRevision,
      },
      parent_attempt_id: args.parentAttemptId ?? null,
      ai_authorization: args.aiAuthorization ?? "not_applicable",
    },
    operation_fingerprint = await hash(payload),
    response = await tongsFetch(
      `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/reference-review/attempts/start`,
      { method: "POST", json: { ...payload, operation_fingerprint } },
    ),
    value = await body(response),
    root = rec(value) && rec(value.data) ? value.data : null,
    attempt = root && rec(root.attempt) ? root.attempt : null,
    attemptId =
      attempt && typeof attempt.attempt_id === "string"
        ? attempt.attempt_id
        : null;
  return response.ok && attemptId
    ? { ok: true, data: { attemptId } }
    : { ok: false, error: "Hearth could not start this review decision." };
}

export async function finishReferenceReviewAttempt(args: {
  workpieceId: string;
  attemptId: string;
  outcome: "succeeded" | "failed";
  failureCode?: string;
  failureMessage?: string;
  receipt?: Record<string, unknown>;
}): Promise<Result<true>> {
  const response = await tongsFetch(
    `/tongs/workpieces/${encodeURIComponent(args.workpieceId)}/reference-review/attempts/finish`,
    {
      method: "POST",
      json: {
        attempt_id: args.attemptId,
        outcome: args.outcome,
        failure_code:
          args.outcome === "failed"
            ? (args.failureCode ?? "reference_review_failed")
            : null,
        failure_message:
          args.outcome === "failed"
            ? (args.failureMessage ?? "Reference review operation failed.")
            : null,
        canonical_receipt_json:
          args.outcome === "succeeded" ? (args.receipt ?? {}) : null,
      },
    },
  );
  return response.ok
    ? { ok: true, data: true }
    : {
        ok: false,
        error: "Tongs could not record the terminal review attempt.",
      };
}
