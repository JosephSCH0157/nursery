import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const endpointSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

function normalizeCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
): string | null {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  return typeof customer.id === "string" && customer.id.trim()
    ? customer.id
    : null;
}

async function requireProfileByCustomerId(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
): Promise<string> {
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Profile lookup failed for stripe_customer_id=${customerId}: ${error.message}`,
    );
  }

  if (!data?.user_id) {
    throw new Error(`No profile found for stripe_customer_id=${customerId}`);
  }

  return data.user_id;
}

async function updateProfileByUserId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("user_id", userId)
    .select("user_id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Profile update failed for supabase_user_id=${userId}: ${error.message}`,
    );
  }

  if (!data?.user_id) {
    throw new Error(`No profile found for supabase_user_id=${userId}`);
  }
}

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
    console.error("Webhook signature failed:", err);
    return new Response("Signature verification failed", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session?.metadata?.supabase_user_id?.trim();
        const customerId = normalizeCustomerId(session?.customer ?? null);

        if (!userId || !customerId) {
          throw new Error("checkout.session.completed missing supabase_user_id or customer");
        }

        await updateProfileByUserId(supabase, userId, {
          stripe_customer_id: customerId,
        });

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = normalizeCustomerId(subscription.customer);
        const status = subscription.status;
        const userIdFromMetadata =
          subscription.metadata?.supabase_user_id?.trim() || null;

        if (!customerId) {
          throw new Error("customer.subscription event missing customer");
        }

        if (userIdFromMetadata) {
          await updateProfileByUserId(supabase, userIdFromMetadata, {
            stripe_customer_id: customerId,
            subscription_status: status,
          });
          break;
        }

        const userId = await requireProfileByCustomerId(supabase, customerId);
        await updateProfileByUserId(supabase, userId, {
          subscription_status: status,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = normalizeCustomerId(subscription.customer);
        const userIdFromMetadata =
          subscription.metadata?.supabase_user_id?.trim() || null;

        if (!customerId) {
          throw new Error("customer.subscription event missing customer");
        }

        if (userIdFromMetadata) {
          await updateProfileByUserId(supabase, userIdFromMetadata, {
            stripe_customer_id: customerId,
            subscription_status: "canceled",
          });
          break;
        }

        const userId = await requireProfileByCustomerId(supabase, customerId);
        await updateProfileByUserId(supabase, userId, {
          subscription_status: "canceled",
        });

        break;
      }

      default:
        console.log(`Unhandled event: ${event.type}`);
    }
  } catch (err) {
    console.error("Webhook processing failed:", err);
    return new Response("Webhook handler failed", { status: 400 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
  });
});
