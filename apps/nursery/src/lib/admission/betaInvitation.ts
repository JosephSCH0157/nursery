import { supabase, tongsSupabase } from "../supabase";

export type BetaInvitationApplication = {
  application_id: string;
  applicant_email: string;
  application_snapshot: Record<string, unknown>;
  submitted_at: string;
  current_decision: "pending" | "approved" | "denied";
  decision_revision: number | null;
  invitation_attempt_id: string | null;
  invitation_event_type: string | null;
  invitation_state: string;
  auth_identity_match_count: number;
  matched_auth_user_id: string | null;
  matched_auth_identity_confirmed: boolean | null;
  matched_auth_identity_invited_at: string | null;
  bound_user_id: string | null;
  effective_admission_state: string | null;
};

type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

const rpcClient = tongsSupabase as unknown as RpcClient;

export async function listBetaInvitationApplications(): Promise<BetaInvitationApplication[]> {
  const { data, error } = await rpcClient.rpc("list_beta_invitation_applications", {
    p_decision: null,
    p_before_submitted_at: null,
    p_before_application_id: null,
    p_limit: 200,
  });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data as BetaInvitationApplication[] : [];
}

export async function decideBetaApplication(
  applicationId: string,
  decision: "approved" | "denied",
  reason: string,
): Promise<void> {
  const { error } = await rpcClient.rpc("decide_beta_access_application", {
    p_application_id: applicationId,
    p_decision: decision,
    p_reason: reason,
    p_operation_id: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message);
}

function operationIds(): Record<string, string> {
  return {
    claim_operation_id: crypto.randomUUID(),
    dispatch_operation_id: crypto.randomUUID(),
    binding_operation_id: crypto.randomUUID(),
    journal_operation_id: crypto.randomUUID(),
    failure_operation_id: crypto.randomUUID(),
  };
}

async function invitationRequest(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired. Sign in again.");
  const response = await fetch("/.netlify/functions/beta-invitations", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const result = await response.json() as Record<string, unknown>;
  if (!response.ok || result.ok !== true) {
    throw new Error(typeof result.code === "string" ? result.code : "invitation_request_failed");
  }
  return result;
}

export async function dispatchBetaInvitation(
  application: BetaInvitationApplication,
  reason: string,
): Promise<Record<string, unknown>> {
  return invitationRequest({
    action: application.invitation_attempt_id ? "retry" : "dispatch",
    application_id: application.application_id,
    attempt_id: application.invitation_attempt_id ?? crypto.randomUUID(),
    reason,
    ...operationIds(),
  });
}

export async function bindExistingBetaIdentity(
  application: BetaInvitationApplication,
  expectedUserId: string,
  reason: string,
): Promise<Record<string, unknown>> {
  return invitationRequest({
    action: "bind_existing",
    application_id: application.application_id,
    attempt_id: application.invitation_attempt_id ?? crypto.randomUUID(),
    expected_user_id: expectedUserId,
    reason,
    binding_operation_id: crypto.randomUUID(),
    acknowledgement_operation_id: crypto.randomUUID(),
    journal_operation_id: crypto.randomUUID(),
  });
}
