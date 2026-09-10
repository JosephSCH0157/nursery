import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function minorUnitsToMicros(amount: number): number {
  return amount * 10_000;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!serviceRoleKey || request.headers.get("authorization") !== `Bearer ${serviceRoleKey}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceRoleKey,
    { auth: { persistSession: false } },
  );
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? "20");
  const limit = Number.isSafeInteger(requested) ? Math.max(1, Math.min(requested, 50)) : 20;
  const { data: deposits, error } = await supabase.schema("tongs").rpc(
    "read_pending_customer_deposits_for_fee_recovery",
    { p_limit: limit },
  );
  if (error) return new Response(error.message, { status: 500 });

  const outcomes: Array<Record<string, unknown>> = [];
  for (const deposit of deposits ?? []) {
    try {
      const intent = await stripe.paymentIntents.retrieve(deposit.stripe_payment_intent_id, {
        expand: ["latest_charge.balance_transaction"],
      });
      let charge = intent.latest_charge;
      if (typeof charge === "string") {
        charge = await stripe.charges.retrieve(charge, { expand: ["balance_transaction"] });
      }
      if (!charge || typeof charge !== "object" || "deleted" in charge) {
        throw new Error("charge evidence unavailable");
      }
      let transaction = charge.balance_transaction;
      if (typeof transaction === "string") {
        transaction = await stripe.balanceTransactions.retrieve(transaction);
      }
      if (!transaction || typeof transaction !== "object") {
        throw new Error("balance transaction evidence unavailable");
      }
      if (transaction.currency.toUpperCase() !== deposit.currency) {
        throw new Error("processor-fee currency mismatch");
      }
      const { data, error: rpcError } = await supabase.schema("tongs").rpc(
        "record_customer_deposit_processor_fee",
        {
          p_fee_id: crypto.randomUUID(),
          p_deposit_id: deposit.deposit_id,
          p_provider_fee_reference: transaction.id,
          p_fee_amount_micros: minorUnitsToMicros(transaction.fee),
          p_recorded_at: new Date(transaction.created * 1000).toISOString(),
          p_evidence_json: {
            source: "bounded_pending_deposit_recovery",
            payment_intent_id: intent.id,
            charge_id: charge.id,
            balance_transaction_id: transaction.id,
          },
        },
      );
      if (rpcError) throw new Error(rpcError.message);
      outcomes.push({ deposit_id: deposit.deposit_id, status: "finalized", replay: data?.replay === true });
    } catch (recoveryError) {
      outcomes.push({
        deposit_id: deposit.deposit_id,
        status: "pending",
        reason: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
      });
    }
  }

  return Response.json({ scanned: deposits?.length ?? 0, outcomes });
});
