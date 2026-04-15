import { tongsFetch } from "../lib/tongsFetch";
import { readJsonBody } from "../lib/json";

export type HammerWorkpieceJobType = "hammer_transcript_prep" | "hammer_transcript_regeneration";
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
  | { ok: false; status: number; error: string };

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
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/jobs`,
      {
        method: "POST",
        json: {
          job_type: args.jobType,
          ...(args.payloadJson ? { payload_json: args.payloadJson } : {}),
        },
        timeoutMs: 20_000,
      },
    );
  } catch (error) {
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to create job." };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to create job.") };
  }
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
  let response: Response;
  try {
    response = await tongsFetch(
      `/tongs/workspaces/${encodeURIComponent(args.workspaceId)}/workpieces/${encodeURIComponent(args.workpieceId)}/jobs/${encodeURIComponent(args.jobId)}`,
      { method: "GET", timeoutMs: 20_000 },
    );
  } catch (error) {
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to load job." };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to load job.") };
  }
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
    return { ok: false, status: 504, error: error instanceof Error ? error.message : "Failed to list jobs." };
  }

  const payload = await readJsonBody(response);
  if (!response.ok) {
    return { ok: false, status: response.status, error: readErrorMessage(payload, "Failed to list jobs.") };
  }
  const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
  const data = root?.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data as Record<string, unknown> : null;
  const jobs = Array.isArray(data?.jobs) ? data?.jobs as HammerWorkpieceJob[] : null;
  if (!jobs) {
    return { ok: false, status: response.status, error: "Jobs response was invalid." };
  }
  return { ok: true, status: response.status, data: { jobs } };
}

