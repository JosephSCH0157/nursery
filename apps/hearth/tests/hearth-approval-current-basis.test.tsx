import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { useApprovalFlow } from "../src/hooks/useApprovalFlow";
import { createHearthOperationAuthority } from "../src/lib/hearth-operation-authority";
import { evaluateHearthScriptValidation } from "../src/lib/hearth-script-tag-policy";

type Args = Parameters<typeof useApprovalFlow>[0];
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const workpieceId = "11111111-1111-4111-8111-111111111111";
const body = "[s1]\nReviewed exact text.\n[/s1]\n";
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }

for (const change of ["hydrated-body", "review-basis", "workspace"]) {
  test(`approval cannot submit after ${change} changes during revision-history loading`, async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: "http://localhost/?tongs_api_token=test-token" });
    const saved = new Map<string, PropertyDescriptor | undefined>();
    for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
      saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
      Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    const originalFetch = globalThis.fetch;
    let submissions = 0;
    globalThis.fetch = (async () => { submissions++; throw new Error("Stale approval must not reach transport"); }) as typeof fetch;
    const entered = deferred<void>(), history = deferred<Awaited<ReturnType<Args["readCanonicalApprovalRevisions"]>>>();
    const authority = createHearthOperationAuthority({ workspaceId, workpieceId, draftId: workpieceId, draftVersion: 1, revisionId: null });
    const no = () => {};
    const args: Args = {
      operationAuthority: authority, workspaceId, workpieceId,
      activeDraft: { id: workpieceId, title: "Fixture", body, createdAt: 1, updatedAt: 1, revisionCount: 0, archived: false },
      isSaving: false, isAiProcessing: false, setError: no, setChatError: no, setAiRuntimeWarning: no,
      setApprovalPersistenceStatus: no, setScriptValidationGateResult: no, clearScriptValidation: no,
      evaluateScriptValidation: evaluateHearthScriptValidation, buildValidationReport: () => "", buildPersistedValidationMeta: () => undefined,
      nextApprovedScriptVersion: () => 1, persistApprovedDraft: async () => true, publishApprovedScript: async () => true,
      readCanonicalApprovalRevisions: async () => { entered.resolve(); return history.promise; },
      commitCanonicalApprovalRevision: async () => ({ ok: true, approvedAt: 1 }),
      mirrorApprovedScript: async () => { throw new Error("Must not mirror a stale approval"); },
      graduateLinkedSpark: () => null, setScriptApprovalState: no, writeScriptApprovalRecoveryEvidence: no,
      updateStyleProfileFromReadyCheckpoint: async () => ({ ok: true }), appendApprovalMarker: no, refreshReadyScripts: no,
      preflight: { id: "review-a", revision: 1, sourceFileRevision: 2, scriptHash: createHash("sha256").update(body).digest("hex"), reviewed: true, stale: false, staleReasons: [], findings: [], researchArtifactId: null, researchArtifactHash: null, report: {} as NonNullable<Args["preflight"]>["report"] },
      approvedScriptVersion: null, approvedAt: null,
    };
    let latest!: ReturnType<typeof useApprovalFlow>;
    function Harness({ value }: { value: Args }) { latest = useApprovalFlow(value); return null; }
    const root = createRoot(dom.window.document.getElementById("root")!);
    try {
      await act(async () => { root.render(createElement(Harness, { value: args })); });
      let pending!: Promise<boolean>;
      await act(async () => { pending = latest.onApproveScript(); await entered.promise; });
      const changed: Args = change === "hydrated-body"
        ? { ...args, activeDraft: { ...args.activeDraft!, body: body.replace("exact", "changed") } }
        : change === "review-basis" ? { ...args, preflight: { ...args.preflight!, id: "review-b", stale: true } }
          : { ...args, workspaceId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
      // Deliberately leave the operation counter unchanged: the latest rendered
      // basis must independently protect hydration/permission-context changes.
      await act(async () => { root.render(createElement(Harness, { value: changed })); });
      await act(async () => { history.resolve({ ok: true, kind: "canonical", authority: "tongs", workpieceId, fileUpdatedAt: null, revisions: [] }); assert.equal(await pending, false); });
      assert.equal(submissions, 0);
    } finally {
      await act(async () => root.unmount());
      dom.window.close(); globalThis.fetch = originalFetch;
      for (const [name, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); }
    }
  });
}
