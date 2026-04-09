import { NextResponse } from "next/server";
import { getAgencyCommercialContext } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cancelAsaasSubscription } from "@/services/payments/asaas";

export async function POST() {
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
      return NextResponse.json({ error: "Somente administradores podem cancelar a assinatura." }, { status: 403 });
    }

    const { data: subscription, error: subscriptionError } = await admin
      .from("agency_subscriptions")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .maybeSingle();

    if (subscriptionError || !subscription) {
      return NextResponse.json({ error: "Assinatura da agência não encontrada." }, { status: 404 });
    }

    if (subscription.status === "canceled") {
      const context = await getAgencyCommercialContext({
        supabase,
        agencyId: profile.agency_id
      });

      return NextResponse.json({
        ok: true,
        alreadyCanceled: true,
        context
      });
    }

    if (subscription.payment_provider !== "asaas" || !subscription.external_subscription_id) {
      return NextResponse.json(
        { error: "Essa assinatura ainda não está vinculada a um contrato cancelável no Asaas." },
        { status: 400 }
      );
    }

    await cancelAsaasSubscription(subscription.external_subscription_id);

    const now = new Date().toISOString();

    await Promise.all([
      admin
        .from("agency_subscriptions")
        .update({
          status: "canceled",
          canceled_at: subscription.canceled_at ?? now
        })
        .eq("id", subscription.id),
      admin
        .from("checkout_sessions")
        .update({
          status: "canceled"
        })
        .eq("provider", "asaas")
        .eq("agency_id", profile.agency_id)
        .eq("provider_subscription_id", subscription.external_subscription_id)
    ]);

    const context = await getAgencyCommercialContext({
      supabase,
      agencyId: profile.agency_id
    });

    return NextResponse.json({
      ok: true,
      context
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível cancelar a assinatura da agência." },
      { status: 500 }
    );
  }
}
