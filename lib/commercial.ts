import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agency, AgencySubscription, Database, Plan } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";

export const COMMERCIAL_PLAN_CODES = ["starter", "pro", "agency", "growth"] as const;
export type CommercialPlanCode = (typeof COMMERCIAL_PLAN_CODES)[number];
export const MANAGEABLE_COMMERCIAL_PLAN_CODES = ["starter", "pro", "agency"] as const;
export type ManageableCommercialPlanCode = (typeof MANAGEABLE_COMMERCIAL_PLAN_CODES)[number];

export const COMMERCIAL_SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "canceled", "suspended"] as const;
export type CommercialSubscriptionStatus = (typeof COMMERCIAL_SUBSCRIPTION_STATUSES)[number];

export type EffectiveSubscriptionStatus = CommercialSubscriptionStatus | "trial_expired";
export type CommercialAction = "create_job" | "create_task" | "invite_user" | "ai_briefing" | "google_drive";

export const COMMERCIAL_STATUS_LABEL: Record<EffectiveSubscriptionStatus, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  suspended: "Suspensa",
  trial_expired: "Trial expirado"
};

export const COMMERCIAL_STATUS_VARIANT: Record<
  EffectiveSubscriptionStatus,
  "neutral" | "success" | "warning" | "danger" | "brand"
> = {
  trial: "brand",
  active: "success",
  past_due: "warning",
  canceled: "neutral",
  suspended: "danger",
  trial_expired: "warning"
};

export type AgencyCommercialContext = {
  plan: Plan;
  subscription: AgencySubscription;
  usage: {
    users: number;
    jobs: number;
  };
  effectiveStatus: EffectiveSubscriptionStatus;
  readOnlyMode: boolean;
  permissions: Record<
    CommercialAction,
    {
      allowed: boolean;
      message: string | null;
    }
  >;
};

const LEGACY_PLAN_CATALOG: Record<
  Database["public"]["Enums"]["agency_plan"],
  Pick<Plan, "code" | "name" | "max_users" | "max_jobs" | "ai_briefing_enabled" | "google_drive_enabled">
> = {
  starter: {
    code: "starter",
    name: "Starter",
    max_users: 5,
    max_jobs: 100,
    ai_briefing_enabled: false,
    google_drive_enabled: false
  },
  growth: {
    code: "growth",
    name: "Growth",
    max_users: 15,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  },
  pro: {
    code: "pro",
    name: "Pro",
    max_users: 15,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  },
  agency: {
    code: "agency",
    name: "Agency",
    max_users: null,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  }
};

function isCommercialPlanCode(value: string): value is CommercialPlanCode {
  return COMMERCIAL_PLAN_CODES.includes(value as CommercialPlanCode);
}

export function normalizeCommercialPlanCode(value: string) {
  return isCommercialPlanCode(value) ? value : null;
}

export function isManageableCommercialPlanCode(value: string | null | undefined): value is ManageableCommercialPlanCode {
  if (!value) return false;
  return MANAGEABLE_COMMERCIAL_PLAN_CODES.includes(value as ManageableCommercialPlanCode);
}

function isCommercialSubscriptionStatus(value: string): value is CommercialSubscriptionStatus {
  return COMMERCIAL_SUBSCRIPTION_STATUSES.includes(value as CommercialSubscriptionStatus);
}

export function normalizeCommercialSubscriptionStatus(value: string) {
  return isCommercialSubscriptionStatus(value) ? value : null;
}

export function formatPlanLimit(limit: number | null | undefined) {
  return limit == null ? "Ilimitado" : String(limit);
}

export function isTrialExpired(subscription: Pick<AgencySubscription, "status" | "trial_ends_at">) {
  if (subscription.status !== "trial") return false;
  if (!subscription.trial_ends_at) return false;
  return new Date(subscription.trial_ends_at).getTime() < Date.now();
}

export function resolveEffectiveSubscriptionStatus(subscription: Pick<AgencySubscription, "status" | "trial_ends_at">) {
  return isTrialExpired(subscription) ? "trial_expired" : subscription.status;
}

function getSubscriptionStatusMessage(status: EffectiveSubscriptionStatus) {
  if (status === "trial_expired") {
    return "Seu período de teste expirou. Para continuar criando jobs e tarefas, entre em contato para ativar seu plano.";
  }

  if (status === "past_due") {
    return "Sua assinatura está com pagamento pendente. O acesso segue em modo de visualização até a regularização.";
  }

  if (status === "canceled") {
    return "Sua assinatura foi cancelada. O sistema permanece em modo de visualização até a reativação do plano.";
  }

  if (status === "suspended") {
    return "Sua assinatura está suspensa. Entre em contato para regularizar o acesso da agência.";
  }

  return null;
}

export function evaluateCommercialAction(context: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus">, action: CommercialAction) {
  const statusMessage = getSubscriptionStatusMessage(context.effectiveStatus);

  if (statusMessage) {
    return {
      allowed: false,
      message: statusMessage
    };
  }

  if (action === "invite_user" && context.plan.max_users != null && context.usage.users >= context.plan.max_users) {
    return {
      allowed: false,
      message: "Seu plano atual atingiu o limite de usuários. Faça upgrade para adicionar mais pessoas."
    };
  }

  if (action === "create_job" && context.plan.max_jobs != null && context.usage.jobs >= context.plan.max_jobs) {
    return {
      allowed: false,
      message: "Seu plano atual atingiu o limite de jobs. Faça upgrade para continuar criando novos jobs."
    };
  }

  if (action === "ai_briefing" && !context.plan.ai_briefing_enabled) {
    return {
      allowed: false,
      message: "A geração de briefing com IA não está disponível no seu plano atual."
    };
  }

  if (action === "google_drive" && !context.plan.google_drive_enabled) {
    return {
      allowed: false,
      message: "A integração com Google Drive não está disponível no seu plano atual."
    };
  }

  return {
    allowed: true,
    message: null
  };
}

function mapAgencyStatusToSubscriptionStatus(status: Agency["status"]): CommercialSubscriptionStatus {
  if (status === "suspended") return "suspended";
  if (status === "trial") return "trial";
  return "active";
}

async function countActiveJobs({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}) {
  let response = await supabase
    .from("jobs")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .is("archived_at", null);

  if (response.error && isMissingJobsArchivedAtColumn(response.error)) {
    response = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId);
  }

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.count ?? 0;
}

async function buildLegacyCommercialContext({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}): Promise<AgencyCommercialContext> {
  const [{ data: rawAgency, error: agencyError }, { count: usersCount }, jobsCount] = await Promise.all([
    supabase
      .from("agencies")
      .select("id, name, plan, status, created_at, trial_starts_at, trial_ends_at")
      .eq("id", agencyId)
      .maybeSingle(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    countActiveJobs({ supabase, agencyId })
  ]);

  if (agencyError || !rawAgency) {
    throw new Error(agencyError?.message ?? "Agência não encontrada para resolver permissões comerciais.");
  }

  const legacyPlan = LEGACY_PLAN_CATALOG[rawAgency.plan] ?? LEGACY_PLAN_CATALOG.starter;
  const plan = {
    id: `legacy-plan-${rawAgency.plan}`,
    code: legacyPlan.code,
    name: `${legacyPlan.name} (legado)`,
    price_monthly: 0,
    max_users: legacyPlan.max_users,
    max_jobs: legacyPlan.max_jobs,
    ai_briefing_enabled: legacyPlan.ai_briefing_enabled,
    google_drive_enabled: legacyPlan.google_drive_enabled,
    active: true,
    created_at: rawAgency.created_at,
    updated_at: rawAgency.created_at
  } satisfies Plan;

  const subscription = {
    id: `legacy-subscription-${rawAgency.id}`,
    agency_id: rawAgency.id,
    plan_id: plan.id,
    status: mapAgencyStatusToSubscriptionStatus(rawAgency.status),
    billing_cycle: "monthly",
    trial_started_at: rawAgency.trial_starts_at,
    trial_ends_at: rawAgency.trial_ends_at,
    current_period_start: rawAgency.trial_starts_at ?? rawAgency.created_at,
    current_period_end: rawAgency.trial_ends_at,
    next_billing_date: rawAgency.trial_ends_at,
    canceled_at: null,
    external_customer_id: null,
    external_subscription_id: null,
    payment_provider: null,
    created_at: rawAgency.created_at,
    updated_at: rawAgency.created_at
  } satisfies AgencySubscription;

  const usage = {
    users: usersCount ?? 0,
    jobs: jobsCount
  };
  const effectiveStatus: EffectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);

  const baseContext: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus"> = {
    plan,
    subscription,
    usage,
    effectiveStatus
  };

  return {
    ...baseContext,
    readOnlyMode: ["past_due", "canceled", "suspended", "trial_expired"].includes(effectiveStatus),
    permissions: {
      create_job: evaluateCommercialAction(baseContext, "create_job"),
      create_task: evaluateCommercialAction(baseContext, "create_task"),
      invite_user: evaluateCommercialAction(baseContext, "invite_user"),
      ai_briefing: evaluateCommercialAction(baseContext, "ai_briefing"),
      google_drive: evaluateCommercialAction(baseContext, "google_drive")
    }
  };
}

export async function getAgencyCommercialContext({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}): Promise<AgencyCommercialContext> {
  const [{ data: rawSubscription, error: subscriptionError }, { count: usersCount }, jobsCount] = await Promise.all([
    supabase.from("agency_subscriptions").select("*").eq("agency_id", agencyId).maybeSingle(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    countActiveJobs({ supabase, agencyId })
  ]);

  if (subscriptionError || !rawSubscription) {
    return buildLegacyCommercialContext({ supabase, agencyId });
  }

  const subscription = rawSubscription as AgencySubscription;

  const { data: rawPlan, error: planError } = await supabase.from("plans").select("*").eq("id", subscription.plan_id).maybeSingle();

  if (planError || !rawPlan) {
    return buildLegacyCommercialContext({ supabase, agencyId });
  }

  const plan = rawPlan as Plan;
  const usage = {
    users: usersCount ?? 0,
    jobs: jobsCount
  };
  const effectiveStatus: EffectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);

  const baseContext: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus"> = {
    plan,
    subscription,
    usage,
    effectiveStatus
  };

  const permissions: AgencyCommercialContext["permissions"] = {
    create_job: evaluateCommercialAction(baseContext, "create_job"),
    create_task: evaluateCommercialAction(baseContext, "create_task"),
    invite_user: evaluateCommercialAction(baseContext, "invite_user"),
    ai_briefing: evaluateCommercialAction(baseContext, "ai_briefing"),
    google_drive: evaluateCommercialAction(baseContext, "google_drive")
  };

  return {
    ...baseContext,
    readOnlyMode: ["past_due", "canceled", "suspended", "trial_expired"].includes(effectiveStatus),
    permissions
  };
}

export async function assertAgencyActionAllowed({
  supabase,
  agencyId,
  action
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
  action: CommercialAction;
}) {
  const context = await getAgencyCommercialContext({ supabase, agencyId });
  const permission = context.permissions[action];

  return {
    allowed: permission.allowed,
    message: permission.message,
    context
  };
}
