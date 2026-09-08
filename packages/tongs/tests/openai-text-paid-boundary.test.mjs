import test from "node:test";
import assert from "node:assert/strict";
import {
  clearOpenAiTextExecutionAdapterForTests,
  executeOpenAiTextTransport,
  installOpenAiTextExecutionAdapter,
  OPENAI_TEXT_ROUTE_CODES,
} from "../dist/providers/openai-text-paid-boundary.js";
import { listOpenAiTextRouteContracts } from "../dist/providers/openai-text-route-contracts.js";

process.env.NODE_ENV = "test";

test("every inventoried caller route has an exact immutable cost-policy identity", () => {
  const contracts = listOpenAiTextRouteContracts();
  assert.deepEqual(contracts.map((contract) => contract.routeCode).sort(), [...OPENAI_TEXT_ROUTE_CODES].sort());
  assert.ok(contracts.every((contract) => /^[0-9a-f-]{36}$/.test(contract.costPolicyRevisionId)));
  assert.ok(contracts.every((contract) => contract.activationReady === false));
});

test("inactive mode is the only legacy pass-through", async () => {
  clearOpenAiTextExecutionAdapterForTests();
  let legacyCalls = 0;
  const value = await executeOpenAiTextTransport({
    routeCode: "hearth.chat_completion",
    mode: "inactive",
    executeLegacy: async () => { legacyCalls += 1; return "legacy"; },
  });
  assert.equal(value, "legacy");
  assert.equal(legacyCalls, 1);
});

test("enforced mode routes all paid transports through the installed server adapter", async () => {
  clearOpenAiTextExecutionAdapterForTests();
  const routes = [];
  const adapter = {
    async execute(request) {
      routes.push(request.routeCode);
      return `coordinated:${request.routeCode}`;
    },
  };
  installOpenAiTextExecutionAdapter(adapter);
  for (const routeCode of OPENAI_TEXT_ROUTE_CODES) {
    const value = await executeOpenAiTextTransport({ routeCode, mode: "enforce", executeLegacy: async () => "legacy" });
    assert.equal(value, `coordinated:${routeCode}`);
  }
  assert.deepEqual(routes, [...OPENAI_TEXT_ROUTE_CODES]);
  assert.throws(() => installOpenAiTextExecutionAdapter({ execute: adapter.execute }), /already_installed/);
  clearOpenAiTextExecutionAdapterForTests();
});

test("enforced mode fails closed when request-scoped funding is unavailable", async () => {
  clearOpenAiTextExecutionAdapterForTests();
  let legacyCalls = 0;
  await assert.rejects(() => executeOpenAiTextTransport({
    routeCode: "quench.metadata",
    mode: "enforce",
    executeLegacy: async () => { legacyCalls += 1; return "legacy"; },
  }), /funding_context_required/);
  assert.equal(legacyCalls, 0);
});
