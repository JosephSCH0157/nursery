// supabase/functions/stripe-webhook/index.ts
import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getMode(): "test" | "live" {
  const raw = (Deno.env.get("STRIPE_MODE") ?? "live").toLowerCase().trim();
  return raw === "test" ? "test" : "live";
}

function getStripeKey(mode: "test" | "live"): string | null {
  if (mode === "test") return Deno.env.get("STRIPE_SECRET_KEY_TEST") ?? null;
  return Deno.env.get("STRIPE_SECRET_KEY") ?? null;
}

function getWebhookSecret(mode: "test" | "live"): string | null {
  if (mode === "test") return Deno.env.get("STRIPE_WEBHOOK_SECRET_TEST") ?? null;
  return Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? null; // add later for live
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "Method not allowed" });

  const mode = getMode();
  const stripeKey = getStripeKey(mode);
  const webhookSecret = getWebhookSecret(mode);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!stripeKey) return json(500, { ok: false, error: `Missing Stripe secret key for mode=${mode}` });
  if (!webhookSecret) return json(500, { ok: false, error: `Missing webhook secret for mode=${mode}` });
  if (!supabaseUrl || !serviceKey) return json(500, { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json(400, { ok: false, error: "Missing stripe-signature header" });

  // IMPORTANT: raw body for signature verification
  const rawBody = await req.text();

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    return json(400, { ok: false, error: `Signature verification failed: ${String(e)}` });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Minimal: just log the event id + type so we can prove delivery and debug.
  // (We’ll do membership updates in the next step.)
  const payload = {
    event_id: event.id,
    event_type: event.type,
    livemode: (event.livemode ?? false),
    received_at: new Date().toISOString(),
  };

  // Insert idempotently (requires event_id unique constraint; if not, we’ll add it next)
  const { error } = await supabase.from("stripe_event_log").insert(payload);

  // If duplicate event_id, ignore it
  if (error && !String(error.message ?? "").toLowerCase().includes("duplicate")) {
    return json(500, { ok: false, error: `DB insert failed: ${String(error.message ?? error)}` });
  }

  return json(200, { ok: true, mode, event_id: event.id, event_type: event.type });
});
