import assert from "node:assert/strict";
import test from "node:test";
import { authorizeRecordingWorkpieceRequest } from "../server/tongs/first-party-user-request";
import { TongsCommitService, createTongsCommitApiHandlerWithService } from "../../../packages/tongs/src/workpiece-commit-api.ts";

const workspace = "11111111-1111-4111-8111-111111111111";
const episode = "22222222-2222-4222-8222-222222222222";
const owner = "33333333-3333-4333-8333-333333333333";
const origin = "http://localhost:5198";
const path = `/tongs/workspaces/${workspace}/recording-workpieces`;
const body = { title: "Synthetic recording", origin_venue: "anvil", operation_key: "recording-workpiece:test" };

function request(headers: HeadersInit = { "x-forge-user-authorization": "Bearer owner-token" }) {
  return new Request(origin + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

function fixture(role: string | null = "owner", invalidToken = false) {
  const calls: { name: string; args: unknown; token: string }[] = [];
  const users: string[] = [];
  const client = {
    auth: { async getUser(token: string) {
      users.push(token);
      return invalidToken ? { data: { user: null }, error: { message: "invalid JWT" } } : { data: { user: { id: owner } }, error: null };
    } },
    schema(name: string) {
      assert.equal(name, "tongs");
      return { from(table: string) {
        const query = {
          select() { return query; }, eq() { return query; },
          async maybeSingle() {
            if (table === "workspaces") return { data: { id: workspace, created_by: role === "owner" ? owner : episode }, error: null };
            assert.equal(table, "workspace_members");
            return { data: role ? { role } : null, error: null };
          },
        };
        return query;
      } };
    },
  };
  const service = new TongsCommitService(client as never, "forge-workpieces", null, (token) => ({
    schema(name: string) {
      assert.equal(name, "tongs");
      return { async rpc(name: string, args: unknown) {
        calls.push({ name, args, token });
        return { data: { outcome: "created", workpiece_id: episode }, error: null };
      } };
    },
  }) as never);
  return { calls, users, handler: createTongsCommitApiHandlerWithService(service, "server-only-credential") };
}

test("local New recording reaches the existing user-scoped RPC without exposing the server credential", async () => {
  const f = fixture();
  const browserRequest = request();
  const forwarded = authorizeRecordingWorkpieceRequest(browserRequest, "server-only-credential");
  assert.equal(browserRequest.headers.get("authorization"), null);
  assert.deepEqual(await forwarded.clone().json(), body);
  const response = await f.handler(forwarded);
  assert.equal(response.status, 201);
  const text = await response.text();
  assert.doesNotMatch(text, /server-only-credential/);
  assert.equal(JSON.parse(text).data.workpiece_id, episode);
  assert.deepEqual(f.users, ["owner-token"]);
  assert.deepEqual(f.calls, [{ name: "create_recording_workpiece", token: "owner-token", args: {
    p_workspace_id: workspace, p_title: body.title, p_origin_venue: "anvil", p_operation_key: body.operation_key,
  } }]);
});

test("missing/malformed user headers and invalid explicit API credentials remain rejected before service access", async () => {
  for (const headers of [{}, { "x-forge-user-authorization": "invalid" }, { "x-forge-user-authorization": "Bearer owner-token", authorization: "Bearer wrong-api-token" }]) {
    const f = fixture();
    const response = await f.handler(authorizeRecordingWorkpieceRequest(request(headers), "server-only-credential"));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "unauthorized");
    assert.equal(f.users.length, 0);
    assert.equal(f.calls.length, 0);
  }
});

test("a bearer-shaped invalid JWT still fails real service user validation", async () => {
  const f = fixture("owner", true);
  const response = await f.handler(authorizeRecordingWorkpieceRequest(request(), "server-only-credential"));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "invalid_user_token");
  assert.equal(f.calls.length, 0);
});

test("nonmembers and viewers cannot create episodes after credential forwarding", async () => {
  for (const role of [null, "viewer"]) {
    const f = fixture(role);
    const response = await f.handler(authorizeRecordingWorkpieceRequest(request(), "server-only-credential"));
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, role ? "insufficient_role" : "workspace_access_denied");
    assert.equal(f.calls.length, 0);
  }
});

test("local forwarding is limited to creation and creation-receipt recovery methods and paths", () => {
  const headers = { "x-forge-user-authorization": "Bearer owner-token" };
  const recovery = new Request(`${origin}/tongs/workspaces/${workspace}/recording-workpiece-creations/receipt-key`, { headers });
  assert.equal(authorizeRecordingWorkpieceRequest(recovery, "server-only-credential").headers.get("authorization"), "Bearer server-only-credential");
  for (const [method, target] of [["GET", path], ["POST", "/tongs/cradles"], ["POST", `/tongs/workspaces/${workspace}/sparks`], ["POST", path + "/extra"], ["POST", "/other" + path]]) {
    const original = new Request(origin + target, { method, headers });
    assert.equal(authorizeRecordingWorkpieceRequest(original, "server-only-credential"), original);
  }
});
