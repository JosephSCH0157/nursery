import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature!,
      endpointSecret,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook signature failed:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        where: "signature",
        eventType: null,
        message: msg,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const userId = session.metadata.supabase_user_id;
        const customerId = session.customer;

        await supabase
          .from("profiles")
          .update({
            stripe_customer_id: customerId,
          })
          .eq("id", userId);

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;

        const customerId = subscription.customer;
        const status = subscription.status;

        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (data) {
          await supabase
            .from("profiles")
            .update({
              subscription_status: status,
            })
            .eq("id", data.id);
        }

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;

        const customerId = subscription.customer;

        const { data } = await supabase
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (data) {
          await supabase
            .from("profiles")
            .update({
              subscription_status: "canceled",
            })
            .eq("id", data.id);
        }

        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Webhook processing failed:", err);
    return new Response(
      JSON.stringify({
        ok: false,
        where: "webhook_processing",
        eventType: event.type ?? null,
        message: msg,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
  });
});
