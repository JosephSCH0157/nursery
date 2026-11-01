import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createBetaInvitationHandler,
  isBetaInvitationMutationEnabled,
  type BetaInvitationDependencies,
} from "../server/auth/beta-invitation-service";

const actorId = randomUUID();
const applicationId = randomUUID();
const attemptId = randomUUID();
const invitedUserId = randomUUID();

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    action: "dispatch",
    application_id: applicationId,
    attempt_id: attemptId,
    claim_operation_id: randomUUID(),
    dispatch_operation_id: randomUUID(),
    binding_operation_id: randomUUID(),
    journal_operation_id: randomUUID(),
    failure_operation_id: randomUUID(),
    reason: "approved beta invitation",
    ...overrides,
  };
}

function request(input: Record<string, unknown>, token = "operator-token"): Request {
  return new Request("https://forge.test/.netlify/functions/beta-invitations", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

function dependencies(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  rpcResults: Record<string, unknown[]>,
  invite: BetaInvitationDependencies["auth"]["inviteUserByEmail"] = async () => ({
    data: { user: { id: invitedUserId } },
    error: null,
  }),
): BetaInvitationDependencies {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: actorId } }, error: null }),
      inviteUserByEmail: invite,
    },
    rpc: {
      rpc: async (name, args) => {
        calls.push({ name, args });
        const values = rpcResults[name] ?? [];
        return { data: values.shift() ?? null, error: null };
      },
    },
    now: () => new Date("2026-11-01T12:00:00.000Z"),
    leaseToken: () => "fixed-test-lease-token",
  };
}

const baseConfig = {
  supabaseUrl: "https://forge.test",
  serviceRoleKey: "test-only-service-role-key",
  publicOrigin: "https://forge.test",
  mutationsEnabled: true,
};

{
  assert.equal(isBetaInvitationMutationEnabled("TRUE"), true);
  assert.equal(isBetaInvitationMutationEnabled("1"), false);
  let touched = false;
  const deps = dependencies([], {}, async () => {
    touched = true;
    return { data: { user: null }, error: null };
  });
  const response = await createBetaInvitationHandler(
    { ...baseConfig, mutationsEnabled: false }, deps,
  )(request(body()));
  assert.equal(response.status, 503);
  assert.equal(touched, false, "disabled handler must not contact Auth admin");
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "dispatch_claimed",
      email: "creator@example.test",
      lease_expires_at: "2026-11-01T12:02:00.000Z",
    }],
    record_beta_invitation_dispatch: [{ event_id: randomUUID() }],
    bind_beta_access_application_as_operator: [{ admission_origin: "application" }],
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body()));
  assert.equal(response.status, 200);
  const result = await response.json() as Record<string, unknown>;
  assert.equal(result.code, "invitation_bound");
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_beta_invitation_dispatch",
    "record_beta_invitation_dispatch",
    "bind_beta_access_application_as_operator",
  ]);
  assert.equal(calls[1]?.args.p_auth_user_id, invitedUserId);
  assert.equal(calls[1]?.args.p_outcome, "succeeded");
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "existing_confirmed",
      email: "creator@example.test",
      auth_user_id: invitedUserId,
    }],
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body()));
  assert.equal(response.status, 409);
  assert.equal((await response.json() as Record<string, unknown>).code, "existing_confirmed");
  assert.equal(calls.length, 1, "confirmed collision requires a separate explicit acknowledgement");
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "dispatch_claimed",
      email: "creator@example.test",
    }],
    record_beta_invitation_dispatch: [{ event_id: randomUUID() }],
  }, async () => {
    throw new Error("connection lost after request");
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body()));
  assert.equal(response.status, 502);
  assert.equal((await response.json() as Record<string, unknown>).code, "invitation_delivery_ambiguous");
  assert.equal(calls[1]?.args.p_outcome, "ambiguous");
  assert.equal(calls.some((call) => call.name.includes("bind_beta")), false);
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let authInviteCalled = false;
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "dispatch_claimed",
      email: "creator@example.test",
      lease_expires_at: "2026-11-01T12:02:00.000Z",
      replayed: true,
    }],
  }, async () => {
    authInviteCalled = true;
    return { data: { user: { id: invitedUserId } }, error: null };
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body()));
  assert.equal(response.status, 409);
  assert.equal(
    (await response.json() as Record<string, unknown>).code,
    "dispatch_claim_replayed_requires_reconciliation",
  );
  assert.equal(authInviteCalled, false, "a replayed dispatch claim must not repeat the Auth side effect");
  assert.deepEqual(calls.map((call) => call.name), ["claim_beta_invitation_dispatch"]);
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "journaled_invitation",
      email: "creator@example.test",
      auth_user_id: invitedUserId,
    }],
    bind_beta_access_application_as_operator: [{ admission_origin: "application" }],
  }, async () => {
    throw new Error("must not send a duplicate invite");
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body({ action: "retry" })));
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_beta_invitation_dispatch",
    "bind_beta_access_application_as_operator",
  ]);
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    bind_existing_beta_access_application_as_operator: [{ admission_origin: "application" }],
  });
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body({
    action: "bind_existing",
    expected_user_id: invitedUserId,
    acknowledgement_operation_id: randomUUID(),
  })));
  assert.equal(response.status, 200);
  assert.equal(calls[0]?.name, "bind_existing_beta_access_application_as_operator");
  assert.equal(calls[0]?.args.p_user_id, invitedUserId);
}

{
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const deps = dependencies(calls, {
    claim_beta_invitation_dispatch: [{
      application_id: applicationId,
      attempt_id: attemptId,
      decision_revision: 1,
      disposition: "journaled_invitation",
      email: "creator@example.test",
      auth_user_id: invitedUserId,
    }],
    bind_beta_access_application_as_operator: [],
  });
  deps.rpc.rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === "claim_beta_invitation_dispatch") {
      return {
        data: {
          application_id: applicationId,
          attempt_id: attemptId,
          decision_revision: 1,
          disposition: "journaled_invitation",
          email: "creator@example.test",
          auth_user_id: invitedUserId,
        },
        error: null,
      };
    }
    if (name === "bind_beta_access_application_as_operator") {
      return { data: null, error: { code: "42501", message: "binding rejected" } };
    }
    if (name === "record_beta_invitation_binding_failure") {
      return { data: null, error: { code: "42501", message: "audit rejected" } };
    }
    return { data: null, error: null };
  };
  const response = await createBetaInvitationHandler(baseConfig, deps)(request(body({ action: "retry" })));
  assert.equal(response.status, 409);
  const result = await response.json() as Record<string, unknown>;
  assert.equal(result.code, "operator_authority_required");
  assert.equal(result.audit_recorded, false, "resolved audit RPC errors must be surfaced");
  assert.deepEqual(calls.map((call) => call.name), [
    "claim_beta_invitation_dispatch",
    "bind_beta_access_application_as_operator",
    "record_beta_invitation_binding_failure",
  ]);
}

console.log("beta invitation orchestration tests passed");
