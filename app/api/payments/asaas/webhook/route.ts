import { NextResponse } from "next/server";
import { issueOnboardingToken, resolvePlanLabel, sendAgencyAccessReadyEmail } from "@/lib/commercial-onboarding-server";
import type { Agency, AgencySubscription, CheckoutSession, Plan } from "@/lib/database.types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import {
  isAsaasDelinquentEvent,
  isAsaasPaymentConfirmed,
  parseAsaasWebhookPayload,
  validateAsaasWebhookRequest
} from "@/services/payments/asaas";

async function findCheckoutSession(admin: ReturnType<typeof createAdminSupabaseClient>, identifiers: {
  checkoutId: string | null;
  subscriptionId: string | null;
  customerId: string | null;
}) {
  if (identifiers.checkoutId) {
    const result = await admin
      .from("checkout_sessions")
      .select("*")
      .eq("provider", "asaas")
      .eq("provider_checkout_id", identifiers.checkoutId)
      .maybeSingle();

    if (result.data) return result.data as CheckoutSession;
  }

  if (identifiers.subscriptionId) {
    const result = await admin
      .from("checkout_sessions")
      .select("*")
      .eq("provider", "asaas")
      .eq("provider_subscription_id", identifiers.subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.data) return result.data as CheckoutSession;
  }

  if (identifiers.customerId) {
    const result = await admin
      .from("checkout_sessions")
      .select("*")
      .eq("provider", "asaas")
      .eq("provider_customer_id", identifiers.customerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.data) return result.data as CheckoutSession;
  }

  return null;
}

function mapAsaasEventToSessionStatus(event: string, confirmed: boolean, delinquent: boolean) {
  if (confirmed) return "paid";
  if (delinquent) return event === "SUBSCRIPTION_DELETED" ? "canceled" : "past_due";
  if (event === "PAYMENT_CREATED" || event === "CHECKOUT_CREATED" || event === "SUBSCRIPTION_CREATED") return "pending";
  return "updated";
}

export async function POST(request: Request) {
  try {
    if (!validateAsaasWebhookRequest(request)) {
      return NextResponse.json({ error: "Webhook Asaas não autorizado." }, { status: 401 });
    }

    const payload = await request.json();
    const parsed = parseAsaasWebhookPayload(payload);
    const admin = createAdminSupabaseClient();

    const checkoutSession = await findCheckoutSession(admin, parsed);
    if (!checkoutSession) {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const confirmed = isAsaasPaymentConfirmed(parsed.event, parsed.paymentStatus);
    const delinquent = isAsaasDelinquentEvent(parsed.event, parsed.paymentStatus);
    const nextSessionStatus = mapAsaasEventToSessionStatus(parsed.event, confirmed, delinquent);

    const [{ data: agency }, { data: subscription }, { data: plan }] = await Promise.all([
      admin.from("agencies").select("*").eq("id", checkoutSession.agency_id).maybeSingle(),
      admin.from("agency_subscriptions").select("*").eq("agency_id", checkoutSession.agency_id).maybeSingle(),
      admin.from("plans").select("*").eq("id", checkoutSession.plan_id).maybeSingle()
    ]);

    if (!agency || !subscription) {
      return NextResponse.json({ error: "Agência ou assinatura não encontrada para esse checkout." }, { status: 404 });
    }

    await admin
      .from("checkout_sessions")
      .update({
        status: nextSessionStatus,
        provider_checkout_id: parsed.checkoutId ?? checkoutSession.provider_checkout_id,
        provider_customer_id: parsed.customerId ?? checkoutSession.provider_customer_id,
        provider_subscription_id: parsed.subscriptionId ?? checkoutSession.provider_subscription_id,
        metadata: parsed.raw
      })
      .eq("id", checkoutSession.id);

    if (confirmed) {
      if (checkoutSession.status !== "paid") {
        await Promise.all([
          admin
            .from("agencies")
            .update({
              status: "active",
              activated_at: agency.activated_at ?? new Date().toISOString()
            })
            .eq("id", agency.id),
          admin
            .from("agency_subscriptions")
            .update({
              status: "active",
              payment_provider: "asaas",
              external_customer_id: parsed.customerId ?? checkoutSession.provider_customer_id,
              external_subscription_id: parsed.subscriptionId ?? checkoutSession.provider_subscription_id,
              next_billing_date: parsed.nextDueDate ?? subscription.next_billing_date
            })
            .eq("id", (subscription as AgencySubscription).id)
        ]);

        const typedAgency = agency as Agency;
        if (typedAgency.owner_email) {
          const onboarding = await issueOnboardingToken({
            supabase: admin,
            agencyId: typedAgency.id,
            email: typedAgency.owner_email
          });

          try {
            await sendAgencyAccessReadyEmail({
              agencyName: typedAgency.name,
              agencySlug: typedAgency.slug,
              ownerName: typedAgency.owner_name ?? "Responsável",
              ownerEmail: typedAgency.owner_email,
              planName: resolvePlanLabel((plan as Plan | null) ?? null),
              onboardingToken: onboarding.token,
              origin: process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? null
            });
          } catch (emailError) {
            console.error("Failed to send BRIFA onboarding email", emailError);
          }
        } else {
          console.warn("Agency activated without owner email", { agencyId: typedAgency.id });
        }
      }

      return NextResponse.json({ ok: true, status: "active" });
    }

    if (delinquent) {
      await admin
        .from("agency_subscriptions")
        .update({
          status: nextSessionStatus === "canceled" ? "canceled" : "past_due",
          payment_provider: "asaas",
          external_customer_id: parsed.customerId ?? checkoutSession.provider_customer_id,
          external_subscription_id: parsed.subscriptionId ?? checkoutSession.provider_subscription_id,
          next_billing_date: parsed.nextDueDate ?? subscription.next_billing_date
        })
        .eq("id", (subscription as AgencySubscription).id);

      return NextResponse.json({ ok: true, status: nextSessionStatus });
    }

    if (parsed.subscriptionId || parsed.customerId) {
      await admin
        .from("agency_subscriptions")
        .update({
          payment_provider: "asaas",
          external_customer_id: parsed.customerId ?? checkoutSession.provider_customer_id,
          external_subscription_id: parsed.subscriptionId ?? checkoutSession.provider_subscription_id,
          next_billing_date: parsed.nextDueDate ?? subscription.next_billing_date
        })
        .eq("id", (subscription as AgencySubscription).id);
    }

    return NextResponse.json({ ok: true, status: nextSessionStatus });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao processar webhook da Asaas." },
      { status: 500 }
    );
  }
}
