import { createHash, randomBytes } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";

export const BETA_INVITATION_MUTATION_FLAG = "FORGE_BETA_INVITATIONS_ENABLED";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };

export type BetaInvitationRpc = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type BetaInvitationAuth = {
  getUser: (token: string) => PromiseLike<{
    data: { user: Pick<User, "id"> | null };
    error: unknown;
  }>;
  inviteUserByEmail: (
    email: string,
    options: { redirectTo: string },
  ) => PromiseLike<{
    data: { user: Pick<User, "id"> | null };
    error: { message?: string; status?: number; code?: string } | null;
  }>;
};

export type BetaInvitationDependencies = {
  auth: BetaInvitationAuth;
  rpc: BetaInvitationRpc;
  now: () => Date;
  leaseToken: () => string;
};

export type BetaInvitationRuntimeConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  publicOrigin: string;
  mutationsEnabled: boolean;
  fetchImpl?: typeof fetch;
};

type DispatchClaim = {
  application_id: string;
  attempt_id: string;
  decision_revision: number;
  disposition:
    | "dispatch_claimed"
    | "busy"
    | "already_bound"
    | "existing_confirmed"
    | "existing_unconfirmed"
    | "journaled_invitation"
    | "ambiguous";
  email: string;
  auth_user_id?: string | null;
  lease_expires_at?: string;
  replayed?: boolean;
};

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function bearer(request: Request): string | null {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

async function objectBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function requiredUuid(value: unknown, name: string): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value.trim())) {
    throw new BetaInvitationRequestError(`${name}_required`, 400);
  }
  return value.trim().toLowerCase();
}

function boundedReason(value: unknown, name = "reason"): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 2000) {
    throw new BetaInvitationRequestError(`${name}_required`, 400);
  }
  return value.trim();
}

function parseOrigin(value: string): string {
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    throw new Error("Forge invitation public origin must be HTTPS or loopback HTTP");
  }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Forge invitation public origin must be an origin only");
  }
  return url.origin;
}

function rpcErrorCode(error: RpcResult["error"], fallback: string): string {
  const code = error?.code?.trim();
  if (code === "42501") return "operator_authority_required";
  if (code === "23505") return "invitation_operation_conflict";
  if (code === "23514") return "identity_email_mismatch";
  if (code === "P0002") return "invitation_record_not_found";
  return fallback;
}

class BetaInvitationRequestError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}

async function rpc(
  dependencies: BetaInvitationDependencies,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result = await dependencies.rpc.rpc(name, args);
  if (result.error) {
    throw new BetaInvitationRequestError(rpcErrorCode(result.error, `${name}_failed`), 409);
  }
  return result.data;
}

async function recordBindingFailure(
  dependencies: BetaInvitationDependencies,
  args: {
    actorId: string;
    applicationId: string;
    attemptId: string;
    operationId: string;
    authUserId: string;
    outcomeCode: string;
  },
): Promise<boolean> {
  try {
    const result = await dependencies.rpc.rpc("record_beta_invitation_binding_failure", {
      p_actor_id: args.actorId,
      p_application_id: args.applicationId,
      p_attempt_id: args.attemptId,
      p_operation_id: args.operationId,
      p_auth_user_id: args.authUserId,
      p_outcome_code: args.outcomeCode,
    });
    return result.error == null;
  } catch {
    // This secondary audit attempt must not hide the authoritative bind failure.
    return false;
  }
}

async function bindJournaledInvitation(
  dependencies: BetaInvitationDependencies,
  actorId: string,
  input: Record<string, unknown>,
  applicationId: string,
  attemptId: string,
  authUserId: string,
): Promise<Response> {
  const bindingOperationId = requiredUuid(input.binding_operation_id, "binding_operation_id");
  const journalOperationId = requiredUuid(input.journal_operation_id, "journal_operation_id");
  const failureOperationId = requiredUuid(input.failure_operation_id, "failure_operation_id");
  const reason = boundedReason(input.reason);
  const result = await dependencies.rpc.rpc("bind_beta_access_application_as_operator", {
    p_actor_id: actorId,
    p_application_id: applicationId,
    p_user_id: authUserId,
    p_reason: reason,
    p_binding_operation_id: bindingOperationId,
    p_attempt_id: attemptId,
    p_journal_operation_id: journalOperationId,
  });
  if (result.error) {
    const auditRecorded = await recordBindingFailure(dependencies, {
      actorId,
      applicationId,
      attemptId,
      operationId: failureOperationId,
      authUserId,
      outcomeCode: rpcErrorCode(result.error, "binding_failed"),
    });
    return json(409, {
      ok: false,
      code: rpcErrorCode(result.error, "binding_failed"),
      attempt_id: attemptId,
      auth_user_id: authUserId,
      audit_recorded: auditRecorded,
    });
  }
  return json(200, {
    ok: true,
    code: "invitation_bound",
    attempt_id: attemptId,
    auth_user_id: authUserId,
    admission: result.data,
  });
}

async function dispatchInvitation(
  dependencies: BetaInvitationDependencies,
  publicOrigin: string,
  actorId: string,
  input: Record<string, unknown>,
): Promise<Response> {
  const applicationId = requiredUuid(input.application_id, "application_id");
  const attemptId = requiredUuid(input.attempt_id, "attempt_id");
  const claimOperationId = requiredUuid(input.claim_operation_id, "claim_operation_id");
  const dispatchOperationId = requiredUuid(input.dispatch_operation_id, "dispatch_operation_id");
  const leaseToken = dependencies.leaseToken();
  const leaseSha256 = createHash("sha256").update(leaseToken, "utf8").digest("hex");
  const leaseExpiresAt = new Date(dependencies.now().getTime() + 120_000).toISOString();
  const claim = await rpc(dependencies, "claim_beta_invitation_dispatch", {
    p_actor_id: actorId,
    p_application_id: applicationId,
    p_attempt_id: attemptId,
    p_operation_id: claimOperationId,
    p_lease_token_sha256: leaseSha256,
    p_lease_expires_at: leaseExpiresAt,
  }) as DispatchClaim;

  if (claim.disposition === "journaled_invitation" && claim.auth_user_id) {
    return bindJournaledInvitation(
      dependencies, actorId, input, applicationId, attemptId, claim.auth_user_id,
    );
  }
  if (claim.disposition === "dispatch_claimed" && claim.replayed === true) {
    return json(409, {
      ok: false,
      code: "dispatch_claim_replayed_requires_reconciliation",
      application_id: applicationId,
      attempt_id: attemptId,
      lease_expires_at: claim.lease_expires_at ?? null,
    });
  }
  if (claim.disposition !== "dispatch_claimed") {
    const status = claim.disposition === "already_bound" ? 200 : 409;
    return json(status, {
      ok: claim.disposition === "already_bound",
      code: claim.disposition,
      application_id: applicationId,
      attempt_id: attemptId,
      auth_user_id: claim.auth_user_id ?? null,
      lease_expires_at: claim.lease_expires_at ?? null,
    });
  }

  let invitedUserId: string | null = null;
  let inviteErrorCode: string | null = null;
  try {
    const result = await dependencies.auth.inviteUserByEmail(claim.email, {
      redirectTo: `${publicOrigin}/auth/callback?type=invite`,
    });
    if (result.error || !result.data.user?.id) {
      inviteErrorCode = result.error?.code?.trim() || "auth_invitation_result_ambiguous";
    } else {
      invitedUserId = result.data.user.id;
    }
  } catch {
    inviteErrorCode = "auth_invitation_transport_ambiguous";
  }

  if (!invitedUserId) {
    await rpc(dependencies, "record_beta_invitation_dispatch", {
      p_actor_id: actorId,
      p_application_id: applicationId,
      p_attempt_id: attemptId,
      p_operation_id: dispatchOperationId,
      p_lease_token: leaseToken,
      p_outcome: "ambiguous",
      p_auth_user_id: null,
      p_outcome_code: inviteErrorCode,
    });
    return json(502, {
      ok: false,
      code: "invitation_delivery_ambiguous",
      application_id: applicationId,
      attempt_id: attemptId,
    });
  }

  await rpc(dependencies, "record_beta_invitation_dispatch", {
    p_actor_id: actorId,
    p_application_id: applicationId,
    p_attempt_id: attemptId,
    p_operation_id: dispatchOperationId,
    p_lease_token: leaseToken,
    p_outcome: "succeeded",
    p_auth_user_id: invitedUserId,
    p_outcome_code: "supabase_invite_returned_uuid",
  });
  return bindJournaledInvitation(
    dependencies, actorId, input, applicationId, attemptId, invitedUserId,
  );
}

async function bindExistingIdentity(
  dependencies: BetaInvitationDependencies,
  actorId: string,
  input: Record<string, unknown>,
): Promise<Response> {
  const applicationId = requiredUuid(input.application_id, "application_id");
  const attemptId = requiredUuid(input.attempt_id, "attempt_id");
  const userId = requiredUuid(input.expected_user_id, "expected_user_id");
  const reason = boundedReason(input.reason);
  const result = await dependencies.rpc.rpc(
    "bind_existing_beta_access_application_as_operator",
    {
      p_actor_id: actorId,
      p_application_id: applicationId,
      p_user_id: userId,
      p_reason: reason,
      p_binding_operation_id: requiredUuid(input.binding_operation_id, "binding_operation_id"),
      p_attempt_id: attemptId,
      p_acknowledgement_operation_id: requiredUuid(
        input.acknowledgement_operation_id,
        "acknowledgement_operation_id",
      ),
      p_journal_operation_id: requiredUuid(input.journal_operation_id, "journal_operation_id"),
    },
  );
  if (result.error) {
    return json(409, {
      ok: false,
      code: rpcErrorCode(result.error, "existing_identity_binding_failed"),
      application_id: applicationId,
      attempt_id: attemptId,
      auth_user_id: userId,
    });
  }
  return json(200, {
    ok: true,
    code: "existing_identity_bound",
    application_id: applicationId,
    attempt_id: attemptId,
    auth_user_id: userId,
    admission: result.data,
  });
}

export function createBetaInvitationHandler(
  config: BetaInvitationRuntimeConfig,
  injected?: BetaInvitationDependencies,
): (request: Request) => Promise<Response> {
  const publicOrigin = parseOrigin(config.publicOrigin);
  const service = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(config.fetchImpl ? { global: { fetch: config.fetchImpl } } : {}),
  });
  const dependencies: BetaInvitationDependencies = injected ?? {
    auth: {
      getUser: (token) => service.auth.getUser(token),
      inviteUserByEmail: (email, options) => service.auth.admin.inviteUserByEmail(email, options),
    } as BetaInvitationAuth,
    rpc: service.schema("tongs") as unknown as BetaInvitationRpc,
    now: () => new Date(),
    leaseToken: () => randomBytes(32).toString("hex"),
  };

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json(405, { ok: false, code: "method_not_allowed" });
    }
    if (!config.mutationsEnabled) {
      return json(503, { ok: false, code: "beta_invitations_disabled" });
    }
    const token = bearer(request);
    if (!token) return json(401, { ok: false, code: "authentication_required" });
    const identity = await dependencies.auth.getUser(token);
    const actorId = identity.data.user?.id;
    if (identity.error || !actorId) {
      return json(401, { ok: false, code: "authentication_required" });
    }
    const input = await objectBody(request);
    if (!input) return json(400, { ok: false, code: "invalid_json" });

    try {
      if (input.action === "dispatch" || input.action === "retry") {
        return await dispatchInvitation(dependencies, publicOrigin, actorId, input);
      }
      if (input.action === "bind_existing") {
        return await bindExistingIdentity(dependencies, actorId, input);
      }
      return json(400, { ok: false, code: "unsupported_action" });
    } catch (error) {
      if (error instanceof BetaInvitationRequestError) {
        return json(error.status, { ok: false, code: error.code });
      }
      return json(502, { ok: false, code: "beta_invitation_orchestration_failed" });
    }
  };
}

export function isBetaInvitationMutationEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}
