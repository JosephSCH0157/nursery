import assert from "node:assert/strict";
import test from "node:test";
import {
  APPLY_AUTHORIZATION,
  buildBackfillRecord,
  listAllFormSubmissions,
  nextLink,
} from "./backfill-beta-admission-applications.mjs";

test("parses the next Netlify pagination link", () => {
  assert.equal(nextLink('<https://api.netlify.com/api/v1/forms/f/submissions?page=2>; rel="next"'),
    "https://api.netlify.com/api/v1/forms/f/submissions?page=2");
  assert.equal(nextLink(null), null);
});

test("historical records prefer application_ref and otherwise use the Netlify submission id", () => {
  const base = {
    id: "submission-7",
    created_at: "2026-10-30T12:00:00Z",
    data: {
      email: "Creator@Example.test",
      name: "Creator",
      creator_type: "Podcast (solo)",
      frequency: "Weekly",
      goals: "Build consistently",
    },
  };
  const fallback = buildBackfillRecord(base);
  assert.equal(fallback.sourceReference, "netlify:submission-7");
  assert.equal(fallback.email, "creator@example.test");
  assert.match(fallback.payloadSha256, /^[0-9a-f]{64}$/);
  const preferred = buildBackfillRecord({ ...base, data: { ...base.data, application_ref: "client-ref" } });
  assert.equal(preferred.sourceReference, "client-ref");
});

test("submission listing follows every Link page without mutating Netlify", async () => {
  const requests = [];
  const pages = [
    { body: [{ id: "one" }], link: '<https://api.netlify.com/page-2>; rel="next"' },
    { body: [{ id: "two" }], link: null },
  ];
  const result = await listAllFormSubmissions({
    formId: "form-id",
    token: "secret",
    async fetchImpl(url, options) {
      requests.push({ url, options });
      const page = pages.shift();
      return {
        ok: true,
        status: 200,
        async json() { return page.body; },
        headers: { get(name) { return name.toLowerCase() === "link" ? page.link : null; } },
      };
    },
  });
  assert.deepEqual(result.map((item) => item.id), ["one", "two"]);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.method, undefined);
  assert.equal(APPLY_AUTHORIZATION, "IMPORT-FORGE-BETA-APPLICATIONS");
});

