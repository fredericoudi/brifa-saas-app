import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencySubscription, Database, Plan } from "@/lib/database.types";
import { type CommercialPlanCode, type CommercialSubscriptionStatus } from "@/lib/commercial";

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function resolveIsoDate(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Informe datas válidas para a assinatura.");
  }

  return parsed.toISOString();
}

export async function upsertAgencySubscription({
  supabase,
  agencyId,
  planCode,
  status,
  trialStartsAt,
  trialEndsAt
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
  planCode: CommercialPlanCode;
  status: CommercialSubscriptionStatus;
  trialStartsAt?: string | null;
  trialEndsAt?: string | null;
}) {
  const [{ data: rawPlan, error: planError }, { data: rawExisting }] = await Promise.all([
    supabase.from("plans").select("*").eq("code", planCode).maybeSingle(),
    supabase.from("agency_subscriptions").select("*").eq("agency_id", agencyId).maybeSingle()
  ]);

  if (planError || !rawPlan) {
    throw new Error(planError?.message ?? "Plano comercial não encontrado.");
  }

  const plan = rawPlan as Plan;
  const existing = (rawExisting as AgencySubscription | null) ?? null;

  const now = new Date();
  const normalizedTrialStart =
    resolveIsoDate(trialStartsAt) ??
    existing?.trial_started_at ??
    (status === "trial" ? now.toISOString() : null);
  const normalizedTrialEnd =
    resolveIsoDate(trialEndsAt) ??
    existing?.trial_ends_at ??
    (status === "trial" && normalizedTrialStart
      ? addDays(new Date(normalizedTrialStart), 7).toISOString()
      : null);
  const currentPeriodStart = existing?.current_period_start ?? now.toISOString();
  const defaultBillingDate =
    status === "trial"
      ? normalizedTrialEnd
      : status === "active" || status === "past_due"
        ? existing?.next_billing_date ?? addDays(now, 30).toISOString()
        : null;

  const payload: Database["public"]["Tables"]["agency_subscriptions"]["Update"] = {
    plan_id: plan.id,
    status,
    billing_cycle: "monthly",
    trial_started_at: normalizedTrialStart,
    trial_ends_at: normalizedTrialEnd,
    current_period_start: currentPeriodStart,
    current_period_end: status === "trial" ? normalizedTrialEnd : existing?.current_period_end ?? null,
    next_billing_date: defaultBillingDate,
    canceled_at: status === "canceled" ? existing?.canceled_at ?? now.toISOString() : null
  };

  const query = existing
    ? supabase.from("agency_subscriptions").update(payload).eq("agency_id", agencyId)
    : supabase.from("agency_subscriptions").insert({
        agency_id: agencyId,
        plan_id: plan.id,
        status,
        billing_cycle: "monthly",
        trial_started_at: normalizedTrialStart,
        trial_ends_at: normalizedTrialEnd,
        current_period_start: currentPeriodStart,
        current_period_end: status === "trial" ? normalizedTrialEnd : null,
        next_billing_date: defaultBillingDate,
        canceled_at: status === "canceled" ? now.toISOString() : null
      });

  const { data: rawSubscription, error: subscriptionError } = await query.select("*").single();

  if (subscriptionError || !rawSubscription) {
    throw new Error(subscriptionError?.message ?? "Não foi possível salvar a assinatura da agência.");
  }

  const subscription = rawSubscription as AgencySubscription;

  await supabase
    .from("agencies")
    .update({
      plan: planCode === "growth" ? "growth" : (planCode as Database["public"]["Enums"]["agency_plan"]),
      trial_activated: status === "trial" ? true : undefined,
      trial_starts_at: subscription.trial_started_at,
      trial_ends_at: subscription.trial_ends_at
    })
    .eq("id", agencyId);

  return {
    plan,
    subscription
  };
}
