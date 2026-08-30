import assert from "node:assert/strict";
import test from "node:test";
import { authorizeFirstPartyUserRequest } from "../netlify/functions/_tongs-handler";

test("Tongs Netlify bridge keeps the API credential server-side for user-authorized requests", async () => {
  const request = new Request("https://podcastersforge.com/tongs/workspaces/00000000-0000-4000-8000-000000000001/sparks", {
    headers: { "x-forge-user-authorization": "Bearer user-access-token" },
  });

  const authorized = authorizeFirstPartyUserRequest(request, "server-api-token");

  assert.equal(authorized.headers.get("authorization"), "Bearer server-api-token");
  assert.equal(authorized.headers.get("x-forge-user-authorization"), "Bearer user-access-token");
  assert.equal(await authorized.text(), "");
});

test("Tongs Netlify bridge never grants API authority without user authority", () => {
  const anonymous = new Request("https://podcastersforge.com/tongs/workspaces/00000000-0000-4000-8000-000000000001/sparks");
  const malformed = new Request(anonymous, {
    headers: { "x-forge-user-authorization": "not-a-bearer-token" },
  });

  assert.equal(authorizeFirstPartyUserRequest(anonymous, "server-api-token").headers.get("authorization"), null);
  assert.equal(authorizeFirstPartyUserRequest(malformed, "server-api-token").headers.get("authorization"), null);
});

test("Tongs Netlify bridge preserves explicit service authorization", () => {
  const request = new Request("https://podcastersforge.com/tongs/cradles", {
    headers: {
      authorization: "Bearer explicit-service-token",
      "x-forge-user-authorization": "Bearer user-access-token",
    },
  });

  const authorized = authorizeFirstPartyUserRequest(request, "server-api-token");
  assert.equal(authorized.headers.get("authorization"), "Bearer explicit-service-token");
});
