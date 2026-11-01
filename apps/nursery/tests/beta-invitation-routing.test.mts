import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const signup = readFileSync(new URL("../src/routes/Signup.tsx", import.meta.url), "utf8");
const callback = readFileSync(new URL("../src/routes/AuthCallback.tsx", import.meta.url), "utf8");
const welcome = readFileSync(new URL("../src/routes/InvitationWelcome.tsx", import.meta.url), "utf8");
const routes = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server/auth/beta-invitation-service.ts", import.meta.url), "utf8");
const netlify = readFileSync(new URL("../netlify/functions/beta-invitations.mts", import.meta.url), "utf8");
const invitationClient = readFileSync(new URL("../src/lib/admission/betaInvitation.ts", import.meta.url), "utf8");
const forgeHub = readFileSync(new URL("../src/routes/ForgeHub.tsx", import.meta.url), "utf8");
const migration429 = readFileSync(
  new URL("../../../supabase/migrations/20261101084703_forge_beta_invitation_provisioning.sql", import.meta.url),
  "utf8",
);

test("public signup UI is retired without changing hosted Auth configuration", () => {
  assert.doesNotMatch(signup, /auth\.signUp|type="password"|Create Account/);
  assert.match(signup, /Forge is invitation-only/);
  assert.match(signup, /Apply for beta/);
  assert.match(routes, /path="\/signup"/);
});

test("invite callback retains intent and enters the admission-aware welcome route", () => {
  assert.match(server, /auth\/callback\?type=invite/);
  assert.match(callback, /invitationCallback \? "\/welcome\/invitation" : next/);
  assert.match(routes, /path="\/welcome\/invitation"/);
  assert.match(welcome, /read_my_admission_onboarding/);
  assert.match(welcome, /supabase\.auth\.updateUser\(\{ password \}\)/);
});

test("the server-only mutation endpoint remains fail-closed by default", () => {
  assert.match(netlify, /FORGE_BETA_INVITATIONS_ENABLED/);
  assert.match(server, /if \(!config\.mutationsEnabled\)/);
  assert.match(server, /beta_invitations_disabled/);
  assert.doesNotMatch(signup, /FORGE_BETA_INVITATIONS_ENABLED/);
});

test("operator listing callers use migration 429's exact RPC argument contract", () => {
  assert.match(
    migration429,
    /create or replace function tongs\.list_beta_invitation_applications\(\s*p_state text default null,/,
  );
  for (const source of [invitationClient, forgeHub]) {
    assert.match(source, /rpc\("list_beta_invitation_applications", \{\s*p_state: null,/);
    assert.doesNotMatch(source, /rpc\("list_beta_invitation_applications", \{\s*p_decision:/);
  }
});
