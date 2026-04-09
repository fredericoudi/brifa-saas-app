import { NextResponse } from "next/server";
import { z } from "zod";
import type { Agency, AgencySubscription, CheckoutSession, Plan } from "@/lib/database.types";
import { resolvePlanLabel, issueOnboardingToken, sendAgencyAccessReadyEmail } from "@/lib/commercial-onboarding-server";
import type { CommercialPlanCode } from "@/lib/commercial";
import { upsertAgencySubscription } from "@/lib/subscription-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const resendSchema = z.object({
  agencySlug: z.string().trim().min(1, "Informe a agência para reenviar o acesso.")
});

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function resolveTrialEndDate(checkoutSession: CheckoutSession | null, subscription: AgencySubscription, agency: Agency) {
  const existing = subscription.trial_ends_at ?? agency.trial_ends_at;
  if (existing) return existing;

  const rawMetadata = checkoutSession?.metadata;
  if (rawMetadata && typeof rawMetadata === "object" && !Array.isArray(rawMetadata)) {
    const subscriptionData =
      "subscription" in rawMetadata && rawMetadata.subscription && typeof rawMetadata.subscription === "object"
        ? rawMetadata.subscription
        : null;

    const nextDueDate =
      subscriptionData && "nextDueDate" in subscriptionData && typeof subscriptionData.nextDueDate === "string"
        ? subscriptionData.nextDueDate
        : null;

    if (nextDueDate) {
      return nextDueDate.length === 10 ? `${nextDueDate}T00:00:00.000Z` : nextDueDate;
    }
  }

  return addMonths(new Date(), 1).toISOString();
}

export async function POST(request: Request) {
  try {
    const parsed = resendSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos para reenviar o acesso." },
        { status: 400 }
      );
    }

    const agencySlug = parsed.data.agencySlug.trim().toLowerCase();
    const admin = createAdminSupabaseClient();

    const { data: rawAgency } = await admin.from("agencies").select("*").eq("slug", agencySlug).maybeSingle();
    if (!rawAgency) {
      return NextResponse.json({ error: "Agência não encontrada para reenviar o acesso." }, { status: 404 });
    }

    const agency = rawAgency as Agency;
    if (!agency.owner_email) {
      return NextResponse.json({ error: "Essa agência ainda não tem um e-mail responsável configurado." }, { status: 400 });
    }

    const [{ data: rawSubscription }, { data: rawCheckoutSession }, { data: rawPlan }] = await Promise.all([
      admin.from("agency_subscriptions").select("*").eq("agency_id", agency.id).maybeSingle(),
      admin.from("checkout_sessions").select("*").eq("agency_id", agency.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("plans").select("*").eq("code", agency.plan).maybeSingle()
    ]);

    if (!rawSubscription) {
      return NextResponse.json({ error: "Assinatura da agência não encontrada para reenviar o acesso." }, { status: 404 });
    }

    const subscription = rawSubscription as AgencySubscription;
    const checkoutSession = (rawCheckoutSession as CheckoutSession | null) ?? null;
    const plan = (rawPlan as Plan | null) ?? null;

    let mode: "trial" | "active";

    if (agency.status === "active") {
      mode = "active";
    } else if (agency.status === "trial") {
      mode = "trial";
    } else if (agency.status === "pending_payment") {
      const trialEndsAt = resolveTrialEndDate(checkoutSession, subscription, agency);
      const trialStartsAt = subscription.trial_started_at ?? agency.trial_starts_at ?? new Date().toISOString();

      await Promise.all([
        upsertAgencySubscription({
          supabase: admin,
          agencyId: agency.id,
          planCode: agency.plan as CommercialPlanCode,
          status: "trial",
          trialStartsAt,
          trialEndsAt
        }),
        admin
          .from("agencies")
          .update({
            status: "trial",
            trial_activated: true,
            activated_at: agency.activated_at ?? new Date().toISOString(),
            trial_starts_at: trialStartsAt,
            trial_ends_at: trialEndsAt
          })
          .eq("id", agency.id),
        checkoutSession
          ? admin.from("checkout_sessions").update({ status: "trialing" }).eq("id", checkoutSession.id)
          : Promise.resolve()
      ]);

      mode = "trial";
    } else {
      return NextResponse.json(
        { error: "Essa agência ainda não está pronta para reenviar o acesso. Aguarde a confirmação do plano." },
        { status: 400 }
      );
    }

    const onboarding = await issueOnboardingToken({
      supabase: admin,
      agencyId: agency.id,
      email: agency.owner_email
    });

    await sendAgencyAccessReadyEmail({
      agencyName: agency.name,
      agencySlug: agency.slug,
      ownerName: agency.owner_name ?? "Responsável",
      ownerEmail: agency.owner_email,
      planName: resolvePlanLabel(plan),
      onboardingToken: onboarding.token,
      origin: process.env.NEXT_PUBLIC_SITE_URL ?? new URL(request.url).origin,
      mode
    });

    return NextResponse.json({
      ok: true,
      email: agency.owner_email,
      mode
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Não foi possível reenviar o e-mail de ativação." },
      { status: 500 }
    );
  }
}
