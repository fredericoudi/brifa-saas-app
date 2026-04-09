import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveAgencyPortalPath } from "@/lib/agency-routing";
import { validateBrazilianTaxId, validatePostalCode } from "@/lib/brazil";
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
  ownerDocument: z.string().trim().min(11, "Informe o CPF ou CNPJ do responsável."),
  ownerPhone: z.string().trim().min(8, "Informe o telefone / WhatsApp do responsável."),
  billingPostalCode: z.string().trim().min(8, "Informe o CEP da cobrança."),
  billingAddress: z.string().trim().min(2, "Informe o endereço da cobrança."),
  billingAddressNumber: z.string().trim().min(1, "Informe o número do endereço."),
  billingComplement: z.string().trim().optional().nullable(),
  billingProvince: z.string().trim().min(2, "Informe o bairro da cobrança."),
  plan: z.string().trim().min(1, "Escolha um plano."),
  acceptTerms: z.boolean().refine((value) => value, {
    message: "Você precisa aceitar os termos para continuar."
  })
});

function buildPlanLookupErrorMessage(planSlug: string) {
  return `O plano ${planSlug} não está disponível para contratação no momento.`;
}

function resolveCommercialOrigin(request: Request) {
  const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallbackOrigin = new URL(request.url).origin;
  return (canonicalOrigin || fallbackOrigin).replace(/\/$/, "");
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

    const documentValidation = validateBrazilianTaxId(parsed.data.ownerDocument);
    if (documentValidation.error || !documentValidation.normalized) {
      return NextResponse.json({ error: documentValidation.error ?? "Informe um CPF ou CNPJ válido." }, { status: 400 });
    }

    const postalCodeValidation = validatePostalCode(parsed.data.billingPostalCode);
    if (postalCodeValidation.error || !postalCodeValidation.normalized) {
      return NextResponse.json({ error: postalCodeValidation.error ?? "Informe um CEP válido." }, { status: 400 });
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
    const origin = resolveCommercialOrigin(request);
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

    const asaasCustomer = await createAsaasCustomer({
      name: parsed.data.ownerName.trim(),
      email: ownerEmail,
      phoneNumber: normalizedPhone,
      document: documentValidation.normalized,
      postalCode: postalCodeValidation.normalized,
      address: parsed.data.billingAddress.trim(),
      addressNumber: parsed.data.billingAddressNumber.trim(),
      complement: parsed.data.billingComplement?.trim() || null,
      province: parsed.data.billingProvince.trim(),
      externalReference: agencyId
    });

    const checkout = await createAsaasCheckoutSession({
      agencyId,
      agencyName: parsed.data.agencyName.trim(),
      customerId: asaasCustomer.id,
      planName: plan.name,
      priceCents: plan.price_cents,
      successUrl: `${origin}/signup?plan=${publicPlanSlug}&status=processing&agency=${normalizedSlug.normalized}`,
      cancelUrl: `${origin}/signup?plan=${publicPlanSlug}&status=canceled`
    });

    await Promise.all([
      admin
        .from("agency_subscriptions")
        .update({
          external_subscription_id: checkout.subscription,
          payment_provider: "asaas"
        })
        .eq("id", subscription.id),
      admin.from("checkout_sessions").insert({
        agency_id: agencyId,
        plan_id: plan.id,
        provider: "asaas",
        provider_checkout_id: checkout.id,
        provider_customer_id: checkout.customer ?? asaasCustomer.id,
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
