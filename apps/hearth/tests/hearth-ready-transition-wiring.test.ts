import assert from "node:assert/strict";
import test from "node:test";
import { commitHearthPrimaryScript } from "../src/lib/hearth-script-repo";

const WORKPIECE_ID = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HASH = "a".repeat(64);
const TRANSITION_ID = "22222222-2222-4222-8222-222222222222";
const VALID_SCRIPT = "[s1]\nCanonical script.\n[/s1]\n";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withHarness(
  transitionOutcome: "saved" | "duplicate" | "stale",
  run: (requests: Array<{ url: string; body: Record<string, unknown> }>) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalWithWindow.window = {
    location: { search: "" },
    localStorage: {
      getItem: (key: string) => key === "forge-auth" ? JSON.stringify({ access_token: "user-token" }) : null,
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    requests.push({ url, body });
    if (url.endsWith("/commit-file")) {
      return response({
        ok: true,
        data: {
          workspace_id: WORKSPACE_ID,
          hash: HASH,
          file_row: { revision: 4 },
        },
      });
    }
    return response({
      ok: true,
      data: {
        outcome: transitionOutcome,
        reason: transitionOutcome === "stale" ? "stale_script_revision" : null,
        ready: transitionOutcome === "stale" ? null : { transition_id: TRANSITION_ID },
      },
    });
  }) as typeof fetch;
  try {
    await run(requests);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalWithWindow, "window");
    else globalWithWindow.window = originalWindow;
  }
}

test("validated publish sends the exact server revision/hash to Ready authority", async () => {
  await withHarness("saved", async (requests) => {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.equal(result.ok, true);
    assert.equal(requests.length, 2);
    const transition = requests[1]?.body ?? {};
    assert.equal(transition.expected_script_revision, 4);
    assert.equal(transition.expected_script_hash, HASH);
    assert.equal(transition.workspace_id, WORKSPACE_ID);
    assert.equal(transition.script_path, "script/script.md");
    assert.deepEqual(transition.publish_evidence, {
      transition: "hearth.script.published.v1",
      script_path: "script/script.md",
      script_revision: 4,
      script_hash: HASH,
      validation: {
        validator_version: "shared-script-tags-v1",
        ok: true,
        issue_count: 0,
      },
    });
    assert.deepEqual((transition.publish_evidence as { validation?: unknown }).validation, {
      validator_version: "shared-script-tags-v1",
      ok: true,
      issue_count: 0,
    });
  });
});

test("duplicate publish retry returns the same canonical Ready authority", async () => {
  await withHarness("duplicate", async (requests) => {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.deepEqual(result, {
      ok: true,
      outcome: "duplicate",
      revision: 4,
      hash: HASH,
      transitionId: TRANSITION_ID,
    });
    assert.match(String(requests[1]?.body.idempotency_key), /:4:/);
  });
});

test("stale Ready transition remains non-ready and requests canonical rehydration", async () => {
  await withHarness("stale", async () => {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, VALID_SCRIPT);
    assert.deepEqual(result, { ok: false, status: 409, reason: "stale", outcome: "stale", rehydrate: true });
  });
});

test("malformed script validation is rejected before canonical commit or transition", async () => {
  await withHarness("saved", async (requests) => {
    const result = await commitHearthPrimaryScript(WORKPIECE_ID, "text outside speaker tags");
    assert.equal(result.ok, false);
    assert.equal(requests.length, 0);
  });
});
