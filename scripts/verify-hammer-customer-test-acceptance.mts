import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const supabaseUrl = required("TONGS_SUPABASE_URL");
const serviceRoleKey = required("TONGS_SERVICE_ROLE_KEY");
const operationId = required("HAMMER_ACCEPTANCE_OPERATION_ID");
const reservationId = required("HAMMER_ACCEPTANCE_RESERVATION_ID");
const authorizationId = required("HAMMER_ACCEPTANCE_AUTHORIZATION_ID");
const closeId = required("HAMMER_ACCEPTANCE_CLOSE_ID");
const userId = required("HAMMER_ACCEPTANCE_USER_ID");
const workspaceId = required("HAMMER_ACCEPTANCE_WORKSPACE_ID");

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const db = service.schema("tongs");

async function rows(table: string, column: string, value: string, order?: string) {
  let query = db.from(table).select("*").eq(column, value);
  if (order) query = query.order(order, { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(`${table} read failed: ${error.message}`);
  return data ?? [];
}

async function one(table: string, column: string, value: string) {
  const found = await rows(table, column, value);
  assert.equal(found.length, 1, `${table} must contain exactly one matching row`);
  return found[0] as Record<string, unknown>;
}

const binding = await one("openai_text_funding_bindings", "operation_id", operationId);
assert.equal(binding.route_code, "hammer.transcript_cleanup");
assert.equal(binding.reservation_id, reservationId);
assert.equal(binding.credential_funding, "forge");
assert.equal(binding.model, "gpt-5.4-mini");
assert.equal(binding.pricing_revision_id, "40010000-0000-4000-8000-000000000402");
assert.equal(binding.cost_policy_revision_id, "40010000-0000-4000-8000-000000000301");
assert.equal(binding.maximum_attempts, 1);

const reservation = await one("funding_reservations", "id", reservationId);
assert.equal(reservation.operation_id, operationId);
assert.equal(reservation.user_id, userId);
assert.equal(reservation.funding_environment, "test");
assert.equal(reservation.rollout_authorization_id, authorizationId);
assert.equal(reservation.reserved_customer_charge_micros, 230000);
assert.equal(reservation.reserved_credit_units, 46);
assert.equal(reservation.reserved_wholesale_spend_micros, 169728);
assert.ok(["customer_deposit", "paid_allowance", "beta_grant"].includes(String(reservation.funding_source_type)));

const quote = await one("customer_spending_quotes", "id", String(reservation.quote_id));
assert.equal(quote.user_id, userId);
assert.equal(quote.workspace_id, workspaceId);
assert.equal(quote.financial_environment, "test");
assert.equal(quote.pricing_revision_id, "40010000-0000-4000-8000-000000000402");
assert.equal(quote.normal_maximum_charge_micros, 230000);
assert.equal(quote.customer_credit_units, 46);
assert.equal(quote.full_cost_ceiling_micros, 169728);
assert.equal(quote.billable_failure_maximum_charge_micros, 0);

const acceptance = await one("customer_spending_quote_acceptances", "quote_id", String(quote.id));
assert.equal(acceptance.user_id, userId);
assert.equal(acceptance.accepted_quote_hash, quote.quote_hash);

const scope = await one("customer_paid_execution_scope_authorizations", "id", authorizationId);
assert.equal(scope.user_id, userId);
assert.equal(scope.workspace_id, workspaceId);
assert.equal(scope.financial_environment, "test");
assert.equal(scope.route_code, "hammer.transcript_cleanup");
assert.equal(scope.authorization_kind, "normal_customer");
assert.equal(scope.model_or_sku, "gpt-5.4-mini");
assert.equal(scope.maximum_operation_count, 1);
assert.equal(scope.maximum_customer_charge_micros, 230000);
assert.equal(scope.maximum_wholesale_exposure_micros, 169728);
assert.equal(scope.maximum_concurrency, 1);

const allScopes = await rows(
  "customer_paid_execution_scope_authorizations",
  "route_code",
  "hammer.transcript_cleanup",
);
const normalCustomerScopes = allScopes.filter((row) => row.authorization_kind === "normal_customer");
const historicalOwnerScopes = allScopes.filter((row) => row.authorization_kind === "owner_only");
assert.equal(normalCustomerScopes.length, 1, "exactly one normal-customer Hammer scope is permitted");
assert.equal(normalCustomerScopes[0]?.id, authorizationId);
assert.equal(historicalOwnerScopes.length, 3, "all three historical owner-only scopes must remain preserved");
for (const historical of historicalOwnerScopes) {
  assert.equal(historical.financial_environment, "test");
  assert.equal(historical.status, "active");
  assert.ok(
    new Date(String(historical.valid_until)).getTime() <= Date.now(),
    `historical owner scope ${historical.id} is not expired`,
  );
}
assert.equal(allScopes.filter((row) => row.financial_environment === "live").length, 0);

const routeRollouts = await rows("openai_text_rollout_revisions", "route_code", "hammer.transcript_cleanup", "revision");
const currentRouteRollout = routeRollouts.at(-1) as Record<string, unknown> | undefined;

const lossRollouts = await rows(
  "openai_text_failure_loss_rollout_revisions",
  "route_code",
  "hammer.transcript_cleanup",
  "revision",
);
const currentTestLoss = lossRollouts.filter((row) => row.financial_environment === "test").at(-1);
const currentLiveLoss = lossRollouts.filter((row) => row.financial_environment === "live").at(-1);
assert.equal(currentLiveLoss?.revision, 1);
assert.equal(currentLiveLoss?.mode, "halt_new");

type RolloutPhase = "pre_activation" | "active" | "post_close";
function classifyRolloutPhase(): RolloutPhase {
  if (currentRouteRollout?.revision === 3 && currentRouteRollout.mode === "halt_new"
      && currentTestLoss?.revision === 1 && currentTestLoss.mode === "halt_new") return "pre_activation";
  if (currentRouteRollout?.revision === 4 && currentRouteRollout.mode === "enforce"
      && currentRouteRollout.cost_policy_revision_id === "40010000-0000-4000-8000-000000000301"
      && currentTestLoss?.revision === 2 && currentTestLoss.mode === "enforce") return "active";
  if (currentRouteRollout?.revision === 5 && currentRouteRollout.mode === "halt_new"
      && currentRouteRollout.cost_policy_revision_id == null
      && currentTestLoss?.revision === 3 && currentTestLoss.mode === "halt_new") return "post_close";
  throw new Error("Hammer rollout revisions do not match a reviewed acceptance phase");
}
const rolloutPhase = classifyRolloutPhase();
assert.notEqual(rolloutPhase, "pre_activation", "no customer transaction exists in the pre-activation phase");

const closures = await rows("hammer_customer_test_acceptance_closures", "id", closeId);
if (rolloutPhase === "post_close") {
  assert.equal(closures.length, 1, "post-close acceptance requires one exact shutdown receipt");
  assert.equal(closures[0]?.authorization_id, authorizationId);
  assert.equal(closures[0]?.route_revision, 5);
  assert.equal(closures[0]?.test_loss_revision, 3);
} else {
  assert.equal(closures.length, 0, "active rollout cannot already have the supplied shutdown receipt");
}

const authorizationReservations = await rows(
  "funding_reservations",
  "rollout_authorization_id",
  authorizationId,
);
const effectiveCustomerScopes = rolloutPhase === "active"
  ? normalCustomerScopes.filter((row) => {
      const validFrom = new Date(String(row.valid_from)).getTime();
      const validUntil = row.valid_until == null ? Number.POSITIVE_INFINITY : new Date(String(row.valid_until)).getTime();
      const maximumOperations = row.maximum_operation_count == null
        ? Number.POSITIVE_INFINITY
        : Number(row.maximum_operation_count);
      return row.status === "active"
        && validFrom <= Date.now()
        && validUntil > Date.now()
        && authorizationReservations.length < maximumOperations;
    })
  : [];
if (rolloutPhase === "post_close") {
  assert.equal(effectiveCustomerScopes.length, 0, "shutdown must leave no effective Hammer customer scope");
}

const events = await rows("funding_reservation_events", "reservation_id", reservationId, "sequence");
assert.ok(events.length >= 3, "reservation lifecycle evidence is incomplete");
assert.equal(events[0]?.event_type, "reserved");
const attemptEvents = events.filter((row) => row.provider_attempt_key != null);
assert.equal(attemptEvents.length, 1, "exactly one provider attempt is allowed");
const terminalEvents = events.filter((row) => ["settled", "released", "submission_unknown"].includes(String(row.event_type)));
assert.equal(terminalEvents.length, 1, "reservation must have one terminal disposition");
assert.equal(terminalEvents[0]?.event_type, "settled", "acceptance evidence requires successful settlement");
assert.equal(terminalEvents[0]?.customer_charge_micros, 230000);
assert.equal(terminalEvents[0]?.credit_units, 46);

const captures = await rows("openai_text_provider_captures", "reservation_id", reservationId);
assert.equal(captures.length, 1, "exactly one provider capture is required");
assert.equal(captures[0]?.attempt_number, 1);
assert.ok(captures[0]?.provider_request_id, "provider request identity is required");

const usage = await rows("openai_text_usage_evidence", "reservation_id", reservationId);
assert.equal(usage.length, 1, "exactly one usage evidence row is required");
const result = await one("hammer_transcript_cleanup_assist_results", "operation_id", operationId);
assert.equal(result.reservation_id, reservationId);
assert.equal(result.user_id, userId);
assert.equal(result.workspace_id, workspaceId);
assert.equal(result.provider_request_id, captures[0]?.provider_request_id);

const paidResults = await rows("openai_text_persisted_results", "reservation_id", reservationId);
assert.equal(paidResults.length, 1, "exactly one paid-result ledger row is required");
assert.equal(paidResults[0]?.customer_charge_micros, 230000);

const consumptionTable = {
  customer_deposit: "customer_deposit_consumptions",
  paid_allowance: "paid_allowance_consumptions",
  beta_grant: "beta_credit_consumptions",
}[String(reservation.funding_source_type)];
assert.ok(consumptionTable, "unsupported customer funding source");
const consumptions = await rows(consumptionTable!, "operation_id", operationId);
assert.equal(consumptions.length, 1, "customer funds must be consumed exactly once");
const consumption = consumptions[0] as Record<string, unknown>;
assert.equal(
  Number(consumption.credit_units_consumed ?? consumption.entitlement_units_consumed),
  46,
);

const journalEvent = await one("accounting_journal_events", "id", String(consumption.journal_event_id));
assert.equal(journalEvent.environment, "test");
const journalEntries = await rows("accounting_journal_entries", "event_id", String(journalEvent.id), "line_number");
assert.ok(journalEntries.length >= 2, "settlement journal must have balancing entries");
const moneyByCurrency = new Map<string, number>();
const unitsByKind = new Map<string, number>();
for (const entry of journalEntries) {
  if (entry.currency) moneyByCurrency.set(String(entry.currency), (moneyByCurrency.get(String(entry.currency)) ?? 0) + Number(entry.amount_micros));
  if (entry.unit_kind) unitsByKind.set(String(entry.unit_kind), (unitsByKind.get(String(entry.unit_kind)) ?? 0) + Number(entry.quantity_delta));
}
for (const [currency, total] of moneyByCurrency) assert.equal(total, 0, `${currency} journal is not balanced`);
for (const [unitKind, total] of unitsByKind) assert.equal(total, 0, `${unitKind} journal is not balanced`);

const expenses = await rows("supplier_expenses", "reservation_id", reservationId);
assert.ok(expenses.length >= 1, "supplier expense evidence is required after provider transmission");
let hasConfirmedZeroExpense = false;
let reconciledExpenseCount = 0;
for (const expense of expenses) {
  if (expense.provider === "forge") {
    assert.equal(expense.amount_micros, 0, "verified Hammer supporting cost must remain zero");
    assert.equal(expense.evidence_status, "confirmed");
    assert.equal(expense.obligation_status, "closed");
    hasConfirmedZeroExpense = true;
    continue;
  }
  assert.equal(expense.provider, "openai", `unexpected supplier provider ${expense.provider}`);
  const adjustments = await rows(
    "openai_supplier_expense_reconciliation_adjustments",
    "supplier_expense_id",
    String(expense.id),
  );
  const obligationEvents = await rows(
    "openai_supplier_expense_obligation_settlement_events",
    "supplier_expense_id",
    String(expense.id),
    "sequence",
  );
  assert.equal(adjustments.length, 1, `supplier expense ${expense.id} must be reconciled exactly once`);
  assert.equal(obligationEvents.length, 1, `supplier expense ${expense.id} must have one effective close`);
  assert.equal(obligationEvents[0]?.effective_obligation_status, "closed");
  assert.equal(
    Number(obligationEvents[0]?.confirmed_amount_micros),
    Number(adjustments[0]?.confirmed_amount_micros),
  );
  assert.equal(
    Number(expense.amount_micros) + Number(adjustments[0]?.adjustment_micros),
    Number(adjustments[0]?.confirmed_amount_micros),
    `supplier expense ${expense.id} effective amount is inconsistent`,
  );
  if (Number(adjustments[0]?.confirmed_amount_micros) === 0) hasConfirmedZeroExpense = true;
  reconciledExpenseCount += 1;
}
assert.ok(hasConfirmedZeroExpense, "verified zero-cost supporting evidence is required");

console.log(JSON.stringify({
  ok: true,
  read_only: true,
  route_code: "hammer.transcript_cleanup",
  operation_id: operationId,
  reservation_id: reservationId,
  authorization_id: authorizationId,
  close_id: closeId,
  rollout_phase: rolloutPhase,
  funding_environment: "test",
  model: "gpt-5.4-mini",
  credit_charge: 46,
  provider_attempts: 1,
  customer_settlements: 1,
  live_scope_count: 0,
  historical_owner_scope_count: historicalOwnerScopes.length,
  effective_customer_scope_count: effectiveCustomerScopes.length,
  supplier_expenses_reconciled: reconciledExpenseCount,
  confirmed_zero_cost_expense_present: hasConfirmedZeroExpense,
}, null, 2));
