import { NextResponse } from "next/server";
import { getAgencyCommercialContext, normalizeCommercialPlanCode } from "@/lib/commercial";
import type { Agency } from "@/lib/database.types";
import { upsertAgencySubscription } from "@/lib/subscription-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

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
      return NextResponse.json({ error: "Somente administradores podem liberar o teste completo." }, { status: 403 });
    }

    const { data: rawAgency, error: agencyError } = await admin
      .from("agencies")
      .select("id, plan, status, trial_activated, activated_at")
      .eq("id", profile.agency_id)
      .maybeSingle();

    const agency = rawAgency as Pick<Agency, "id" | "plan" | "status" | "trial_activated" | "activated_at"> | null;

    if (agencyError || !agency) {
      return NextResponse.json({ error: "Agência não encontrada." }, { status: 404 });
    }

    if (agency.trial_activated) {
      const context = await getAgencyCommercialContext({
        supabase,
        agencyId: profile.agency_id
      });

      return NextResponse.json(
        {
          error: "TRIAL_ALREADY_ACTIVATED",
          message: "O acesso completo de 7 dias já foi utilizado para esta agência.",
          context
        },
        { status: 409 }
      );
    }

    if (["inactive", "suspended", "pending_payment"].includes(agency.status)) {
      return NextResponse.json(
        { error: "A agência não está elegível para ativar o teste completo neste momento." },
        { status: 403 }
      );
    }

    const trialStart = new Date();
    const trialEnd = addDays(trialStart, 7);
    const trialStartIso = trialStart.toISOString();
    const trialEndIso = trialEnd.toISOString();

    const { data: updatedAgency, error: updateError } = await admin
      .from("agencies")
      .update({
        status: "trial",
        trial_activated: true,
        trial_starts_at: trialStartIso,
        trial_ends_at: trialEndIso,
        activated_at: agency.activated_at ?? trialStartIso
      })
      .eq("id", agency.id)
      .eq("trial_activated", false)
      .select("id")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    if (!updatedAgency) {
      const context = await getAgencyCommercialContext({
        supabase,
        agencyId: profile.agency_id
      });

      return NextResponse.json(
        {
          error: "TRIAL_ALREADY_ACTIVATED",
          message: "O acesso completo de 7 dias já foi utilizado para esta agência.",
          context
        },
        { status: 409 }
      );
    }

    const planCode = normalizeCommercialPlanCode(agency.plan) ?? "starter";

    await upsertAgencySubscription({
      supabase: admin,
      agencyId: profile.agency_id,
      planCode,
      status: "trial",
      trialStartsAt: trialStartIso,
      trialEndsAt: trialEndIso
    });

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
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível liberar o acesso completo por 7 dias."
      },
      { status: 500 }
    );
  }
}
