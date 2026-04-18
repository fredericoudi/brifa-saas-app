import { NextResponse } from "next/server";
import type { Plan } from "@/lib/database.types";
import { resolveNextUpgradePlanCode } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAsaasCheckoutSession } from "@/services/payments/asaas";

function resolveCommercialOrigin(request: Request) {
  const canonicalOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  const fallbackOrigin = new URL(request.url).origin;
  return (canonicalOrigin || fallbackOrigin).replace(/\/$/, "");
}

function resolveTodayInSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

export async function POST(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const admin = createAdminSupabaseClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, agency_id, role, platform_role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    if (profile.role !== "admin" && profile.platform_role !== "super_admin") {
      return NextResponse.json({ error: "Somente administradores podem alterar o plano da agência." }, { status: 403 });
    }

    const [{ data: agency }, { data: subscription, error: subscriptionError }, { data: latestCheckoutSession }] = await Promise.all([
      admin.from("agencies").select("id, name, slug, plan").eq("id", profile.agency_id).maybeSingle(),
      admin.from("agency_subscriptions").select("*").eq("agency_id", profile.agency_id).maybeSingle(),
      admin
        .from("checkout_sessions")
        .select("provider_customer_id")
        .eq("agency_id", profile.agency_id)
        .eq("provider", "asaas")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    if (!agency) {
      return NextResponse.json({ error: "Agência não encontrada." }, { status: 404 });
    }

    if (subscriptionError || !subscription) {
      return NextResponse.json({ error: "Assinatura da agência não encontrada." }, { status: 404 });
    }

    const nextPlanCode = resolveNextUpgradePlanCode(agency.plan);
    if (!nextPlanCode) {
      return NextResponse.json(
        { error: "Você já usa o plano mais completo. Para personalizações, entre em contato com o suporte." },
        { status: 400 }
      );
    }

    const { data: targetPlan, error: targetPlanError } = await admin.from("plans").select("*").eq("code", nextPlanCode).maybeSingle();

    if (targetPlanError || !targetPlan) {
      return NextResponse.json({ error: "O próximo plano não está disponível para upgrade no momento." }, { status: 400 });
    }

    const customerId = subscription.external_customer_id ?? latestCheckoutSession?.provider_customer_id ?? null;

    if (!customerId) {
      return NextResponse.json(
        { error: "Não encontramos um cadastro de cobrança dessa agência. Entre em contato com o suporte para concluir o upgrade." },
        { status: 400 }
      );
    }

    const origin = resolveCommercialOrigin(request);
    const publicSettingsUrl = `${origin}/app/${agency.slug}/settings`;
    const typedTargetPlan = targetPlan as Plan;

    const checkout = await createAsaasCheckoutSession({
      agencyId: agency.id,
      agencyName: agency.name,
      customerId,
      planName: typedTargetPlan.name,
      priceCents: typedTargetPlan.price_cents,
      successUrl: `${publicSettingsUrl}?upgrade=processing`,
      cancelUrl: `${publicSettingsUrl}?upgrade=canceled`,
      nextDueDate: resolveTodayInSaoPaulo()
    });

    await admin.from("checkout_sessions").insert({
      agency_id: agency.id,
      plan_id: typedTargetPlan.id,
      provider: "asaas",
      provider_checkout_id: checkout.id,
      provider_customer_id: checkout.customer ?? customerId,
      provider_subscription_id: checkout.subscription,
      checkout_url: checkout.url,
      status: "pending",
      metadata: {
        ...(typeof checkout.raw === "object" && checkout.raw && !Array.isArray(checkout.raw) ? checkout.raw : {}),
        commercial_flow: "upgrade",
        upgrade_from_plan_code: agency.plan,
        upgrade_to_plan_code: typedTargetPlan.code
      }
    });

    return NextResponse.json({
      ok: true,
      checkoutUrl: checkout.url,
      targetPlanName: typedTargetPlan.name
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível iniciar o upgrade do plano." },
      { status: 500 }
    );
  }
}
