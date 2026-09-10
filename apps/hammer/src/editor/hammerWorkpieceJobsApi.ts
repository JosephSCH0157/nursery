import { tongsFetch } from "../lib/tongsFetch";
import { readJsonBody } from "../lib/json";
import {
  confirmCustomerSpendingQuote,
  customerSpendingAcceptance,
  readCustomerSpendingQuote,
} from "../../../../packages/tongs/src/customer-spending-confirmation";

export type HammerWorkpieceJobType = "hammer_transcript_prep" | "hammer_transcript_regeneration" | "hammer_final_video_render";
export type HammerWorkpieceJobStatus = "queued" | "running" | "completed" | "failed" | "canceled";

export type HammerWorkpieceJob = {
  id: string;
  workspace_id: string;
  workpiece_id: string;
  job_type: HammerWorkpieceJobType;
  status: HammerWorkpieceJobStatus;
  requested_by: string;
  payload_json: Record<string, unknown>;
  result_json: Record<string, unknown> | null;
  error_code: string | null;
  error_message: string | null;
  progress_percent: number | null;
  attempt_count: number;
  runner_id: string | null;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type HammerWorkpieceJobsResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; retryAfterMs?: number };

type HammerJobsBackoffState = {
  attempts: number;
  nextAllowedAtMs: number;
};

const jobsBackoffByKey = new Map<string, HammerJobsBackoffState>();

function isRetryableJobsStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function computeBackoffDelayMs(attempts: number): number {
  const safeAttempts = Number.isFinite(attempts) && attempts > 0 ? Math.trunc(attempts) : 1;
  const baseMs = 1000;
  const capMs = 30_000;
  const exp = Math.min(5, safeAttempts - 1);
  const delay = Math.min(capMs, baseMs * (2 ** exp));
  const jitter = Math.floor(Math.random() * 250);
  return delay + jitter;
}

function getBackoffKey(args: { workspaceId: string; workpieceId: string; route: string }): string {
  return `${args.workspaceId}:${args.workpieceId}:${args.route}`;
}

function noteJobsFailure(key: string): number {
  const state = jobsBackoffByKey.get(key) ?? { attempts: 0, nextAllowedAtMs: 0 };
  state.attempts += 1;
  const delay = computeBackoffDelayMs(state.attempts);
  state.nextAllowedAtMs = Date.now() + delay;
  jobsBackoffByKey.set(key, state);
  return delay;
}

function clearJobsBackoff(key: string): void {
  jobsBackoffByKey.delete(key);
}

function readErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const row = payload as Record<string, unknown>;
    const error = row.error && typeof row.error === "object" && !Array.isArray(row.error)
      ? row.error as Record<string, unknown>
      : null;
    const message = typeof error?.message === "string" ? error.message : null;
    if (message) return message;
  }
  return fallback;
}

export async function createWorkpieceJob(args: {
  workspaceId: string;
  workpieceId: string;
  jobType: HammerWorkpieceJobType;
  payloadJson?: Record<string, unknown>;
}): Promise<HammerWorkpieceJobsResult<{ job: HammerWorkpieceJob }>> {
  const backoffKey = getBackoffKey({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, route: "create" });
  const backoff = jobsBackoffByKey.get(backoffKey);
  if (backoff && Date.now() < backoff.nextAllowedAtMs) {
    return {
      ok: false,
      status: 503,
      error: "Background job status temporarily unavailable.",
      retryAfterMs: Math.max(250, backoff.nextAllowedAtMs - Date.now()),
    };
  }

  let response: Response;
  try {
    const submit = (payloadJson?: Record<string, unknown>) => tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/jobs`,
      { method: "POST", json: { job_type: args.jobType, ...(payloadJson ? { payload_json: payloadJson } : {}) }, timeoutMs: 20_000 },
    );
    response = await submit(args.payloadJson);
    if ((response.status === 409 || response.status === 402)
      && (args.jobType === "hammer_transcript_prep" || args.jobType === "hammer_transcript_regeneration")) {
      const quoted = await response.clone().json().catch(() => null);
      const quote = readCustomerSpendingQuote(quoted);
      if (quote?.funding_eligible && confirmCustomerSpendingQuote(quote)) {
        response = await submit({ ...(args.payloadJson ?? {}), spending_acceptance: customerSpendingAcceptance(quote) });
      }
    }
  } catch (error) {
    const retryAfterMs = noteJobsFailure(backoffKey);
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to create job.", retryAfterMs };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    const errorMessage = readErrorMessage(payload, "Failed to create job.");
    if (isRetryableJobsStatus(response.status)) {
      const retryAfterMs = noteJobsFailure(backoffKey);
      return { ok: false, status: response.status, error: errorMessage, retryAfterMs };
    }
    return { ok: false, status: response.status, error: errorMessage };
  }
  clearJobsBackoff(backoffKey);
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : null;
  const job = data?.job as HammerWorkpieceJob | undefined;
  if (!job?.id) {
    return { ok: false, status: response.status, error: "Job create response was invalid." };
  }
  return { ok: true, status: response.status, data: { job } };
}

export async function fetchWorkpieceJob(args: {
  workspaceId: string;
  workpieceId: string;
  jobId: string;
}): Promise<HammerWorkpieceJobsResult<{ job: HammerWorkpieceJob }>> {
  const backoffKey = getBackoffKey({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, route: "fetch" });
  const backoff = jobsBackoffByKey.get(backoffKey);
  if (backoff && Date.now() < backoff.nextAllowedAtMs) {
    return {
      ok: false,
      status: 503,
      error: "Background job status temporarily unavailable.",
      retryAfterMs: Math.max(250, backoff.nextAllowedAtMs - Date.now()),
    };
  }

  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/jobs/${encodeURIComponent(args.jobId)}`,
      { method: "GET", timeoutMs: 20_000 },
    );
  } catch (error) {
    const retryAfterMs = noteJobsFailure(backoffKey);
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to load job.", retryAfterMs };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    const errorMessage = readErrorMessage(payload, "Failed to load job.");
    if (isRetryableJobsStatus(response.status)) {
      const retryAfterMs = noteJobsFailure(backoffKey);
      return { ok: false, status: response.status, error: errorMessage, retryAfterMs };
    }
    return { ok: false, status: response.status, error: errorMessage };
  }
  clearJobsBackoff(backoffKey);
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : null;
  const job = data?.job as HammerWorkpieceJob | undefined;
  if (!job?.id) {
    return { ok: false, status: response.status, error: "Job response was invalid." };
  }
  return { ok: true, status: response.status, data: { job } };
}

export async function listWorkpieceJobs(args: {
  workspaceId: string;
  workpieceId: string;
  activeOnly?: boolean;
  limit?: number;
}): Promise<HammerWorkpieceJobsResult<{ jobs: HammerWorkpieceJob[] }>> {
  const backoffKey = getBackoffKey({ workspaceId: args.workspaceId, workpieceId: args.workpieceId, route: "list" });
  const backoff = jobsBackoffByKey.get(backoffKey);
  if (backoff && Date.now() < backoff.nextAllowedAtMs) {
    return {
      ok: false,
      status: 503,
      error: "Background job status temporarily unavailable.",
      retryAfterMs: Math.max(250, backoff.nextAllowedAtMs - Date.now()),
    };
  }

  const params = new URLSearchParams();
  if (args.activeOnly) params.set("active", "1");
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) params.set("limit", String(Math.trunc(args.limit)));

  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/jobs${params.toString() ? `?${params.toString()}` : ""}`,
      { method: "GET", timeoutMs: 20_000 },
    );
  } catch (error) {
    const retryAfterMs = noteJobsFailure(backoffKey);
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to list jobs.", retryAfterMs };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    const errorMessage = readErrorMessage(payload, "Failed to list jobs.");
    if (isRetryableJobsStatus(response.status)) {
      const retryAfterMs = noteJobsFailure(backoffKey);
      return { ok: false, status: response.status, error: errorMessage, retryAfterMs };
    }
    return { ok: false, status: response.status, error: errorMessage };
  }
  clearJobsBackoff(backoffKey);
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : null;
  const jobs = Array.isArray(data?.jobs) ? data?.jobs as HammerWorkpieceJob[] : null;
  if (!jobs) {
    return { ok: false, status: response.status, error: "Jobs response was invalid." };
  }
  return { ok: true, status: response.status, data: { jobs } };
}
