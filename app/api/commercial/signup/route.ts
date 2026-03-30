import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAgencyPortalPath } from "@/lib/agency-routing";
import {
  generatePendingAgencyId,
  normalizePublicSignupPlanSlug,
  resolveCommercialPlanCodeFromSignupPlan,
  validateCommercialSlug
} from "@/lib/commercial-signup";
import type { Database, Plan } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertAgencySubscription } from "@/lib/subscription-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createAsaasCheckoutSession, createAsaasCustomer } from "@/services/payments/asaas";

const signupSchema = z.object({
  agencyName: z.string().trim().min(2, "Informe o nome da agência."),
  slug: z.string().trim().min(1, "Escolha o slug do portal da agência."),
  ownerName: z.string().trim().min(2, "Informe o nome do responsável."),
  ownerEmail: z.string().trim().email("Informe um e-mail válido."),
  ownerPhone: z.string().trim().min(8, "Informe o telefone / WhatsApp do responsável."),
  plan: z.string().trim().min(1, "Escolha um plano."),
  acceptTerms: z.boolean().refine((value) => value, {
    message: "Você precisa aceitar os termos para continuar."
  })
});

function buildPlanLookupErrorMessage(planSlug: string) {
  return `O plano ${planSlug} não está disponível para contratação no momento.`;
}

export async function POST(request: Request) {
  let createdAgencyId: string | null = null;

  try {
    const parsed = signupSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos para iniciar a contratação." },
        { status: 400 }
      );
    }

    const publicPlanSlug = normalizePublicSignupPlanSlug(parsed.data.plan);
    if (!publicPlanSlug) {
      return NextResponse.json({ error: "Plano comercial inválido." }, { status: 400 });
    }

    const normalizedSlug = validateCommercialSlug(parsed.data.slug);
    if (normalizedSlug.error || !normalizedSlug.normalized) {
      return NextResponse.json({ error: normalizedSlug.error ?? "Slug inválido." }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.ownerPhone);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Informe o WhatsApp no formato 5511999999999." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const planCode = resolveCommercialPlanCodeFromSignupPlan(publicPlanSlug);

    const [{ data: existingAgency }, { data: rawPlan, error: planError }] = await Promise.all([
      admin.from("agencies").select("id").eq("slug", normalizedSlug.normalized).maybeSingle(),
      admin.from("plans").select("*").eq("code", planCode).maybeSingle()
    ]);

    if (existingAgency) {
      return NextResponse.json(
        { error: "Esse slug já está em uso. Escolha outro identificador para a agência." },
        { status: 409 }
      );
    }

    if (planError || !rawPlan) {
      return NextResponse.json(
        { error: buildPlanLookupErrorMessage(publicPlanSlug) },
        { status: 400 }
      );
    }

    const plan = rawPlan as Plan;
    if (!plan.active) {
      return NextResponse.json({ error: buildPlanLookupErrorMessage(publicPlanSlug) }, { status: 400 });
    }
    const origin = new URL(request.url).origin;
    const agencyId = generatePendingAgencyId();
    createdAgencyId = agencyId;
    const ownerEmail = parsed.data.ownerEmail.trim().toLowerCase();

    const { error: agencyError } = await admin.from("agencies").insert({
      id: agencyId,
      name: parsed.data.agencyName.trim(),
      slug: normalizedSlug.normalized,
      plan: planCode as Database["public"]["Enums"]["agency_plan"],
      status: "pending_payment",
      owner_name: parsed.data.ownerName.trim(),
      owner_email: ownerEmail,
      owner_phone: normalizedPhone
    });

    if (agencyError) {
      const duplicateSlug = agencyError.message.toLowerCase().includes("agencies_slug_key");
      return NextResponse.json(
        { error: duplicateSlug ? "Esse slug já está em uso. Escolha outro identificador para a agência." : agencyError.message },
        { status: 400 }
      );
    }

    const { subscription } = await upsertAgencySubscription({
      supabase: admin,
      agencyId,
      planCode,
      status: "pending_payment"
    });

    const customer = await createAsaasCustomer({
      name: parsed.data.ownerName.trim(),
      email: ownerEmail,
      phoneNumber: normalizedPhone,
      externalReference: agencyId
    });

    const checkout = await createAsaasCheckoutSession({
      customerId: customer.id,
      agencyId,
      planName: plan.name,
      priceCents: plan.price_cents,
      ownerName: parsed.data.ownerName.trim(),
      ownerEmail,
      ownerPhone: normalizedPhone,
      successUrl: `${origin}/signup?plan=${publicPlanSlug}&status=processing&agency=${normalizedSlug.normalized}`,
      cancelUrl: `${origin}/signup?plan=${publicPlanSlug}&status=canceled`
    });

    await Promise.all([
      admin
        .from("agency_subscriptions")
        .update({
          external_customer_id: customer.id,
          external_subscription_id: checkout.subscription,
          payment_provider: "asaas"
        })
        .eq("id", subscription.id),
      admin.from("checkout_sessions").insert({
        agency_id: agencyId,
        plan_id: plan.id,
        provider: "asaas",
        provider_checkout_id: checkout.id,
        provider_customer_id: customer.id,
        provider_subscription_id: checkout.subscription,
        checkout_url: checkout.url,
        status: "pending",
        metadata: checkout.raw
      })
    ]);

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkout.url,
      agency: {
        id: agencyId,
        slug: normalizedSlug.normalized,
        portalPath: resolveAgencyPortalPath(normalizedSlug.normalized)
      }
    });
  } catch (error) {
    if (createdAgencyId) {
      const admin = createAdminSupabaseClient();
      await admin.from("agencies").delete().eq("id", createdAgencyId);
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível iniciar a contratação." },
      { status: 500 }
    );
  }
}
