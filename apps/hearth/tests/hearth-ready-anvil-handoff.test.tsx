import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useHearthAnvilOpenAction } from "../src/hooks/useHearthAnvilOpenAction";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";

type Args = Parameters<typeof useHearthAnvilOpenAction>[0];
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workpieceId = "11111111-1111-4111-8111-111111111111";
const text = "[s1]\nReviewed canonical script.\n[/s1]\n";
const hash = createHash("sha256").update(text).digest("hex");
const ready = {
  workspace_id: workspaceId, workpiece_id: workpieceId, source_file_path: "script/script.md",
  source_file_revision: 2, script_approval_revision: 1,
  script_approval_id: "22222222-2222-4222-8222-222222222222",
  ready_transition_id: "33333333-3333-4333-8333-333333333333",
  script_text: text, script_content_hash: hash,
};
function deferred() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }

for (const scenario of ["unchanged-repeat", "existing-approved-without-ready", "edited-draft", "canonical-advance", "unapproved",
  "stale-approval", "denied", "wrong-workspace", "corrupt-hash", "missing-approval", "hydration-race", "workspace-race", "saving", "missing-draft"]) {
  test(`Start Recording: ${scenario}; reconciles only through authorized Tongs authority`, async () => {
    const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/?tongs_api_token=test-token" });
    const navigation: string[] = [], errors: Array<string | null> = [], requests: string[] = [];
    let flushed = 0;
    const runtime = new Proxy(dom.window, { get(target, key) {
      if (key === "location") return { search: "?tongs_api_token=test-token", assign: (url: string) => navigation.push(url) };
      return Reflect.get(target, key);
    } });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const [key, value] of Object.entries({ window: runtime, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
    const originalFetch = globalThis.fetch, entered = deferred(), release = deferred();
    const racing = scenario.endsWith("-race");
    globalThis.fetch = (async (url, init) => {
      requests.push(String(url));
      if (String(url).endsWith("recording-readiness")) {
        assert.equal(init?.method, "POST");
        const requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        assert.deepEqual(requestBody, { workspace_id: workspaceId });
        const failure = scenario === "unapproved"
          ? { outcome: "not_found", reason: "current_approval_not_found" }
          : scenario === "stale-approval"
            ? { outcome: "stale", reason: "approved_script_is_not_current" }
            : scenario === "denied"
              ? { outcome: "denied", reason: "editor_required" }
              : scenario === "wrong-workspace"
                ? { outcome: "not_found", reason: "active_episode_membership_invalid" }
                : null;
        return new Response(JSON.stringify({ ok: true, data: failure
          ? { ...failure, ready: null }
          : { outcome: scenario === "existing-approved-without-ready" ? "saved" : "duplicate", reason: null, ready: { transition_id: ready.ready_transition_id } } }), { status: 200 });
      }
      if (String(url).endsWith("production-script")) {
        assert.equal(init?.method, "GET");
        assert.equal(init?.cache, "no-store");
        entered.resolve();
        if (racing) await release.promise;
        const data = { ...ready,
          ...(scenario === "corrupt-hash" ? { script_content_hash: "0".repeat(64) } : {}),
          ...(scenario === "missing-approval" ? { script_approval_id: null } : {}),
        };
        return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
      }
      assert.equal(init?.method, "GET");
      assert.equal(init?.cache, "no-store");
      assert.match(String(url), /read-file\?path=script%2Fscript.md$/);
      return new Response(JSON.stringify({ ok: true, data: text,
        file_row: { revision: scenario === "canonical-advance" ? 3 : 2, hash_value: hash } }));
    }) as typeof fetch;
    const args: Args = {
      activeDraft: scenario === "missing-draft" ? null : { id: workpieceId, body: scenario === "edited-draft" ? text + "Changed." : text,
        title: "Fixture", createdAt: 1, updatedAt: 1, archived: false, revisionCount: 0 },
      workspaceId, workpieceId, activeWorkpieceIsArchived: false, isSaving: scenario === "saving",
      setError: error => errors.push(error), buildOpenInAnvilHref: () => "/anvil/teleprompter_pro.html",
      flushChatHistoryNow: () => { flushed++; },
      operationAuthority: createHearthOperationAuthority({ workspaceId, workpieceId, draftId: workpieceId, draftVersion: 1, revisionId: null }),
    };
    let open!: ReturnType<typeof useHearthAnvilOpenAction>;
    function Harness({ value }: { value: Args }) { open = useHearthAnvilOpenAction(value); return null; }
    const root = createRoot(dom.window.document.getElementById("root")!);
    try {
      await act(async () => { root.render(createElement(Harness, { value: args })); });
      if (racing) {
        let pending!: Promise<void>;
        await act(async () => { pending = open(); await entered.promise; });
        const changed = scenario === "workspace-race" ? { ...args, workspaceId: workpieceId }
          : { ...args, activeDraft: { ...args.activeDraft!, body: text + "Hydrated edit" } };
        await act(async () => { root.render(createElement(Harness, { value: changed })); });
        await act(async () => { release.resolve(); await pending; });
      } else {
        await act(async () => { await open(); });
      }
      if (scenario === "unchanged-repeat") {
        await act(async () => { await open(); });
        assert.equal(navigation.length, 2); assert.equal(flushed, 2);
        assert.equal(requests.length, 6); assert.equal(errors.at(-1), null);
      } else if (scenario === "existing-approved-without-ready") {
        assert.equal(navigation.length, 1); assert.equal(flushed, 1);
        assert.equal(requests.length, 3); assert.equal(errors.at(-1), null);
      } else {
        assert.equal(navigation.length, 0); assert.equal(flushed, 0);
        if (!racing) assert.ok(errors.at(-1));
      }
    } finally {
      await act(async () => root.unmount());
      dom.window.close(); globalThis.fetch = originalFetch;
      for (const [key, value] of saved) { if (value) Object.defineProperty(globalThis, key, value); else Reflect.deleteProperty(globalThis, key); }
    }
  });
}
