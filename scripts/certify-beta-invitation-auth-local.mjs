import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createBetaInvitationHandler,
} from "../apps/nursery/server/auth/beta-invitation-service.ts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing local certification input: ${name}`);
  return value;
};

const apiUrl = new URL(required("S2A_LOCAL_SUPABASE_URL"));
const anonKey = required("S2A_LOCAL_ANON_KEY");
const serviceRoleKey = required("S2A_LOCAL_SERVICE_ROLE_KEY");
const mailpitUrl = new URL(required("S2A_LOCAL_MAILPIT_URL"));
const container = required("SUPABASE_DB_CONTAINER");

assert.equal(apiUrl.protocol, "http:");
assert.ok(["127.0.0.1", "localhost", "::1"].includes(apiUrl.hostname));
assert.ok(["127.0.0.1", "localhost", "::1"].includes(mailpitUrl.hostname));
assert.match(container, /^supabase_db_forge-s2a-cert-[a-z0-9-]+$/);
const jwtPayload = JSON.parse(Buffer.from(serviceRoleKey.split(".")[1], "base64url").toString("utf8"));
assert.equal(jwtPayload.role, "service_role");
assert.equal(jwtPayload.iss, "supabase-demo");

const service = createClient(apiUrl.origin, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const publicClient = createClient(apiUrl.origin, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const rpc = service.schema("tongs");

function sql(statement) {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres", "-At"],
    { input: statement, encoding: "utf8" },
  ).trim();
}

async function createConfirmedUser(email, password) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  assert.ok(data.user?.id);
  return data.user.id;
}

async function application(email, sourceReference) {
  const { data: ingested, error: ingestError } = await rpc.rpc("ingest_beta_access_application", {
    p_source_reference: sourceReference,
    p_payload_sha256: "a".repeat(64),
    p_email: email,
    p_name: "Slice 2A Local Auth Proof",
    p_creator_type: "Podcast (solo)",
    p_frequency: "Weekly",
    p_goals: "Certify exact invitation continuity",
    p_teleprompter_used: null,
    p_frustrations: null,
    p_notes: null,
    p_submitted_at: new Date().toISOString(),
  });
  assert.ifError(ingestError);
  const applicationId = ingested?.[0]?.application_id;
  assert.ok(applicationId);
  return applicationId;
}

async function approve(operatorRpc, applicationId) {
  const { error } = await operatorRpc.rpc("decide_beta_access_application", {
    p_application_id: applicationId,
    p_decision: "approved",
    p_reason: "exact local Supabase Auth invitation certification",
    p_operation_id: randomUUID(),
  });
  assert.ifError(error);
}

function dispatchBody(applicationId, attemptId, action = "dispatch") {
  return {
    action,
    application_id: applicationId,
    attempt_id: attemptId,
    claim_operation_id: randomUUID(),
    dispatch_operation_id: randomUUID(),
    binding_operation_id: randomUUID(),
    journal_operation_id: randomUUID(),
    failure_operation_id: randomUUID(),
    reason: "exact local Supabase Auth invitation certification",
  };
}

function operatorRequest(token, body) {
  return new Request(`${apiUrl.origin}/.netlify/functions/beta-invitations`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function authUsersByEmail(email) {
  const matches = [];
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 100 });
    assert.ifError(error);
    matches.push(...data.users.filter((user) => user.email?.toLowerCase() === email.toLowerCase()));
    if (data.users.length < 100) break;
  }
  return matches;
}

const suffix = randomUUID().slice(0, 8);
const operatorEmail = `s2a-operator-${suffix}@example.test`;
const operatorPassword = `Forge-S2A-${suffix}-Operator!9`;
const operatorId = await createConfirmedUser(operatorEmail, operatorPassword);
sql(`insert into tongs.platform_operators(user_id, reason, granted_by) values ('${operatorId}', 'Slice 2A local Auth certification', '${operatorId}');`);
const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({
  email: operatorEmail,
  password: operatorPassword,
});
assert.ifError(signInError);
assert.ok(signedIn.session?.access_token);
const operatorToken = signedIn.session.access_token;
const operatorClient = createClient(apiUrl.origin, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { authorization: `Bearer ${operatorToken}` } },
}).schema("tongs");

const handler = createBetaInvitationHandler({
  supabaseUrl: apiUrl.origin,
  serviceRoleKey,
  publicOrigin: "http://127.0.0.1:3000",
  mutationsEnabled: true,
});

const concurrentEmail = `s2a-concurrent-${suffix}@example.test`;
const concurrentApplication = await application(concurrentEmail, `s2a-concurrent-${suffix}`);
await approve(operatorClient, concurrentApplication);
const concurrentAttempt = randomUUID();
const concurrentResponses = await Promise.all([
  handler(operatorRequest(operatorToken, dispatchBody(concurrentApplication, concurrentAttempt))),
  handler(operatorRequest(operatorToken, dispatchBody(concurrentApplication, concurrentAttempt))),
]);
const concurrentResults = await Promise.all(concurrentResponses.map((response) => response.json()));
assert.ok(concurrentResponses.some((response) => response.status === 200), JSON.stringify(concurrentResults));
assert.equal((await authUsersByEmail(concurrentEmail)).length, 1, "concurrent dispatch created duplicate Auth users");

const concurrentEvidence = JSON.parse(sql(`
  select json_build_object(
    'bindings', (select count(*) from tongs.beta_access_identity_bindings binding join tongs.beta_access_applications app on app.id=binding.application_id where app.id='${concurrentApplication}'),
    'grants', (select count(*) from tongs.account_admission_events event where event.origin_application_id='${concurrentApplication}' and event.event_type='grant'),
    'profiles', (select count(*) from public.profiles profile join tongs.beta_access_identity_bindings binding on binding.user_id=profile.user_id where binding.application_id='${concurrentApplication}'),
    'memberships', (select count(*) from tongs.workspace_members member join tongs.beta_access_identity_bindings binding on binding.user_id=member.user_id where binding.application_id='${concurrentApplication}')
  )::text;
`));
assert.deepEqual(concurrentEvidence, { bindings: 1, grants: 1, profiles: 1, memberships: 1 });

const ambiguousEmail = `s2a-ambiguous-${suffix}@example.test`;
const ambiguousApplication = await application(ambiguousEmail, `s2a-ambiguous-${suffix}`);
await approve(operatorClient, ambiguousApplication);
const ambiguousAttempt = randomUUID();
const ambiguousDependencies = {
  auth: {
    getUser: (token) => service.auth.getUser(token),
    inviteUserByEmail: async (email, options) => {
      const result = await service.auth.admin.inviteUserByEmail(email, options);
      assert.ifError(result.error);
      assert.ok(result.data.user?.id);
      throw new Error("simulated response loss after Auth accepted invitation");
    },
  },
  rpc,
  now: () => new Date(),
  leaseToken: () => randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
};
const ambiguousHandler = createBetaInvitationHandler({
  supabaseUrl: apiUrl.origin,
  serviceRoleKey,
  publicOrigin: "http://127.0.0.1:3000",
  mutationsEnabled: true,
}, ambiguousDependencies);
const ambiguousResponse = await ambiguousHandler(operatorRequest(
  operatorToken,
  dispatchBody(ambiguousApplication, ambiguousAttempt),
));
assert.equal(ambiguousResponse.status, 502);
const retryResponse = await handler(operatorRequest(
  operatorToken,
  dispatchBody(ambiguousApplication, ambiguousAttempt, "retry"),
));
assert.equal(retryResponse.status, 409);
assert.equal((await retryResponse.json()).code, "existing_unconfirmed");
assert.equal((await authUsersByEmail(ambiguousEmail)).length, 1, "ambiguous retry created a second Auth identity");
assert.equal(sql(`select count(*) from tongs.beta_access_identity_bindings binding where binding.application_id='${ambiguousApplication}';`), "0");

const existingEmail = `s2a-existing-${suffix}@example.test`;
const existingUserId = await createConfirmedUser(existingEmail, `Forge-S2A-${suffix}-Existing!9`);
const existingApplication = await application(existingEmail, `s2a-existing-${suffix}`);
await approve(operatorClient, existingApplication);
const existingAttempt = randomUUID();
const collision = await handler(operatorRequest(
  operatorToken,
  dispatchBody(existingApplication, existingAttempt),
));
assert.equal(collision.status, 409);
const collisionResult = await collision.json();
assert.equal(collisionResult.code, "existing_confirmed");
assert.equal(collisionResult.auth_user_id, existingUserId);
const acknowledged = await handler(operatorRequest(operatorToken, {
  action: "bind_existing",
  application_id: existingApplication,
  attempt_id: existingAttempt,
  expected_user_id: existingUserId,
  reason: "operator acknowledged exact confirmed Auth UUID",
  binding_operation_id: randomUUID(),
  acknowledgement_operation_id: randomUUID(),
  journal_operation_id: randomUUID(),
}));
assert.equal(acknowledged.status, 200, JSON.stringify(await acknowledged.clone().json()));

const mailpitResponse = await fetch(new URL("/api/v1/messages", mailpitUrl));
assert.equal(mailpitResponse.ok, true);
const messages = await mailpitResponse.json();
const recipients = JSON.stringify(messages.messages ?? []).toLowerCase();
assert.ok(recipients.includes(concurrentEmail));
assert.ok(recipients.includes(ambiguousEmail));
assert.equal(recipients.includes(existingEmail), false, "confirmed collision unexpectedly dispatched an invitation");

const authContainer = execFileSync(
  "docker",
  ["inspect", container.replace("supabase_db_", "supabase_auth_"), "--format", "{{.Config.Image}}|{{.State.Health.Status}}"],
  { encoding: "utf8" },
).trim();
assert.equal(authContainer, "public.ecr.aws/supabase/gotrue:v2.188.1|healthy");

console.log(JSON.stringify({
  ok: true,
  schema: "forge.beta-invitation-auth-local-certification.v1",
  authImage: "public.ecr.aws/supabase/gotrue:v2.188.1",
  concurrentStatuses: concurrentResponses.map((response) => response.status).sort(),
  concurrentEvidence,
  ambiguousRetry: "existing_unconfirmed",
  ambiguousIdentityCount: 1,
  confirmedCollisionAcknowledged: true,
  mailpitMessages: messages.total ?? messages.messages_count ?? null,
  hostedRequests: 0,
  externalInvitations: 0,
}));
