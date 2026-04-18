import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agency, AgencySubscription, Database, Plan } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";

export const COMMERCIAL_PLAN_CODES = ["starter", "pro", "agency", "growth"] as const;
export type CommercialPlanCode = (typeof COMMERCIAL_PLAN_CODES)[number];
export const MANAGEABLE_COMMERCIAL_PLAN_CODES = ["starter", "pro", "agency"] as const;
export type ManageableCommercialPlanCode = (typeof MANAGEABLE_COMMERCIAL_PLAN_CODES)[number];
export const SELF_SERVE_UPGRADE_PATH: Record<CommercialPlanCode, CommercialPlanCode | null> = {
  starter: "pro",
  pro: "agency",
  agency: null,
  growth: "agency"
} as const;

export const COMMERCIAL_SUBSCRIPTION_STATUSES = [
  "trial",
  "active",
  "past_due",
  "canceled",
  "suspended",
  "pending_payment"
] as const;
export type CommercialSubscriptionStatus = (typeof COMMERCIAL_SUBSCRIPTION_STATUSES)[number];

export const LIMITS = {
  STARTER: {
    clients: 3,
    users: 3,
    aiGenerations: 5
  },
  PRO: {
    clients: Number.POSITIVE_INFINITY,
    users: 5,
    aiGenerations: 100
  },
  BUSINESS: {
    clients: Number.POSITIVE_INFINITY,
    users: 10,
    aiGenerations: Number.POSITIVE_INFINITY
  }
} as const;

export type EffectiveSubscriptionStatus = CommercialSubscriptionStatus | "trial_expired";
export type CommercialAction = "create_job" | "create_task" | "create_client" | "invite_user" | "ai_briefing" | "google_drive";
export type CommercialPermissionReason = "subscription_blocked" | "limit_reached" | "feature_unavailable";

export const COMMERCIAL_STATUS_LABEL: Record<EffectiveSubscriptionStatus, string> = {
  trial: "Trial",
  active: "Ativa",
  past_due: "Pagamento pendente",
  canceled: "Cancelada",
  suspended: "Suspensa",
  pending_payment: "Pagamento pendente",
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
  pending_payment: "warning",
  trial_expired: "warning"
};

export type AgencyCommercialContext = {
  plan: Plan;
  subscription: AgencySubscription;
  usage: {
    users: number;
    jobs: number;
    clients: number;
    aiGenerations: number;
  };
  trial: {
    activated: boolean;
    active: boolean;
    expired: boolean;
    daysLeft: number;
  };
  effectiveStatus: EffectiveSubscriptionStatus;
  readOnlyMode: boolean;
  permissions: Record<
    CommercialAction,
    {
      allowed: boolean;
      message: string | null;
      reason: CommercialPermissionReason | null;
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
    max_users: 3,
    max_jobs: 100,
    ai_briefing_enabled: true,
    google_drive_enabled: false
  },
  growth: {
    code: "growth",
    name: "Growth",
    max_users: 5,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  },
  pro: {
    code: "pro",
    name: "Pro",
    max_users: 5,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  },
  agency: {
    code: "agency",
    name: "Agency",
    max_users: 10,
    max_jobs: null,
    ai_briefing_enabled: true,
    google_drive_enabled: true
  }
};

type FreemiumPlanType = keyof typeof LIMITS;

function isCommercialPlanCode(value: string): value is CommercialPlanCode {
  return COMMERCIAL_PLAN_CODES.includes(value as CommercialPlanCode);
}

export function resolveNextUpgradePlanCode(currentPlanCode: string | null | undefined): CommercialPlanCode | null {
  if (!currentPlanCode || !isCommercialPlanCode(currentPlanCode)) {
    return null;
  }

  return SELF_SERVE_UPGRADE_PATH[currentPlanCode];
}

function isMissingSupabaseTable(message: string, table: string) {
  return message.includes(`Could not find the table 'public.${table}'`) || message.includes(`relation \"${table}\" does not exist`);
}

function isMissingAgencyTrialColumns(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("agencies.trial_activated") ||
    normalized.includes("agencies.trial_starts_at") ||
    normalized.includes("agencies.trial_ends_at") ||
    (normalized.includes("trial_activated") && normalized.includes("does not exist")) ||
    (normalized.includes("trial_starts_at") && normalized.includes("does not exist")) ||
    (normalized.includes("trial_ends_at") && normalized.includes("does not exist")) ||
    (normalized.includes("schema cache") &&
      (normalized.includes("trial_activated") || normalized.includes("trial_starts_at") || normalized.includes("trial_ends_at")))
  );
}

type AgencyCommercialBase = {
  id: string;
  name?: string;
  plan?: Database["public"]["Enums"]["agency_plan"];
  status?: Database["public"]["Enums"]["agency_status"];
  created_at?: string;
  trial_activated?: boolean | null;
  trial_starts_at?: string | null;
  trial_ends_at?: string | null;
};

async function fetchAgencyCommercialBase<T extends AgencyCommercialBase>({
  supabase,
  agencyId,
  selectWithTrialColumns,
  selectWithoutTrialColumns
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
  selectWithTrialColumns: string;
  selectWithoutTrialColumns: string;
}) {
  const primaryResponse = await supabase
    .from("agencies")
    .select(selectWithTrialColumns)
    .eq("id", agencyId)
    .maybeSingle();

  if (!primaryResponse.error) {
    return {
      data: (primaryResponse.data as T | null) ?? null,
      error: null as null
    };
  }

  if (!isMissingAgencyTrialColumns(primaryResponse.error.message)) {
    return {
      data: null as T | null,
      error: primaryResponse.error
    };
  }

  const fallbackResponse = await supabase
    .from("agencies")
    .select(selectWithoutTrialColumns)
    .eq("id", agencyId)
    .maybeSingle();

  if (fallbackResponse.error) {
    return {
      data: null as T | null,
      error: fallbackResponse.error
    };
  }

  return {
    data: fallbackResponse.data
      ? ({
          ...fallbackResponse.data,
          trial_activated: null,
          trial_starts_at: null,
          trial_ends_at: null
        } as T)
      : null,
    error: null as null
  };
}

function resolveFreemiumPlan(planCode: string | null | undefined): FreemiumPlanType {
  if (planCode === "pro" || planCode === "growth") {
    return "PRO";
  }

  if (planCode === "agency") {
    return "BUSINESS";
  }

  return "STARTER";
}

function resolveFreemiumPlanLabel(plan: FreemiumPlanType) {
  if (plan === "BUSINESS") return "Business";
  if (plan === "PRO") return "Pro";
  return "Starter";
}

function formatFiniteLimit(limit: number) {
  return Number.isFinite(limit) ? String(limit) : "ilimitado";
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

export function isTrialActive(agency: {
  trial_ends_at?: string | null;
  trialEndDate?: string | null;
}) {
  const trialEndDate = agency.trialEndDate ?? agency.trial_ends_at ?? null;

  if (!trialEndDate) return false;
  return new Date(trialEndDate).getTime() > Date.now();
}

export function isTrialActivated(agency: {
  trial_activated?: boolean | null;
  trialActivated?: boolean | null;
  trial_starts_at?: string | null;
  trialStartDate?: string | null;
  trial_ends_at?: string | null;
  trialEndDate?: string | null;
}) {
  if (agency.trialActivated != null) return Boolean(agency.trialActivated);
  if (agency.trial_activated != null) return Boolean(agency.trial_activated);

  return Boolean(
    agency.trialStartDate ??
      agency.trial_starts_at ??
      agency.trialEndDate ??
      agency.trial_ends_at
  );
}

export function canActivateTrial(agency: {
  trial_activated?: boolean | null;
  trialActivated?: boolean | null;
  trial_starts_at?: string | null;
  trialStartDate?: string | null;
  trial_ends_at?: string | null;
  trialEndDate?: string | null;
}) {
  return !isTrialActivated(agency);
}

export function getTrialDaysLeft(agency: {
  trial_ends_at?: string | null;
  trialEndDate?: string | null;
}) {
  const trialEndDate = agency.trialEndDate ?? agency.trial_ends_at ?? null;
  if (!trialEndDate) return 0;

  const diff = new Date(trialEndDate).getTime() - Date.now();
  if (diff <= 0) return 0;

  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function canCreateClient(agency: {
  plan: string | null | undefined;
  trial_ends_at?: string | null;
  trialEndDate?: string | null;
  status?: string | null;
  clientsCount: number;
}) {
  if (isTrialActive(agency)) return true;

  const limit = LIMITS[resolveFreemiumPlan(agency.plan)].clients;
  return agency.clientsCount < limit;
}

export function canUseAI(
  agency: {
    plan: string | null | undefined;
    trial_ends_at?: string | null;
    trialEndDate?: string | null;
    status?: string | null;
  },
  aiUsageCount: number
) {
  if (isTrialActive(agency)) return true;

  const limit = LIMITS[resolveFreemiumPlan(agency.plan)].aiGenerations;
  return aiUsageCount < limit;
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
  if (status === "past_due") {
    return "Sua assinatura está com pagamento pendente. O acesso segue em modo de visualização até a regularização.";
  }

  if (status === "pending_payment") {
    return "Seu cadastro foi iniciado e o pagamento ainda não foi confirmado. Assim que a cobrança for aprovada, o painel da agência será liberado.";
  }

  if (status === "canceled") {
    return "Sua assinatura foi cancelada. O sistema permanece em modo de visualização até a reativação do plano.";
  }

  if (status === "suspended") {
    return "Sua assinatura está suspensa. Entre em contato para regularizar o acesso da agência.";
  }

  return null;
}

export function evaluateCommercialAction(
  context: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus" | "trial">,
  action: CommercialAction
) {
  const trialActive = context.trial.active;

  if (trialActive) {
    return {
      allowed: true,
      message: null,
      reason: null
    };
  }

  const statusMessage = getSubscriptionStatusMessage(context.effectiveStatus);

  if (statusMessage) {
    return {
      allowed: false,
      message: statusMessage,
      reason: "subscription_blocked" as const
    };
  }

  const planCodeForLimits = context.effectiveStatus === "trial_expired" ? "starter" : context.plan.code;
  const freemiumPlan = resolveFreemiumPlan(planCodeForLimits);
  const freemiumLimit = LIMITS[freemiumPlan];
  const freemiumPlanLabel = resolveFreemiumPlanLabel(freemiumPlan);

  if (action === "create_client") {
    if (!canCreateClient({
      plan: planCodeForLimits,
      status: context.subscription.status,
      trial_ends_at: context.subscription.trial_ends_at,
      clientsCount: context.usage.clients
    })) {
      return {
        allowed: false,
        message: `Você atingiu o limite de ${formatFiniteLimit(freemiumLimit.clients)} clientes no plano ${freemiumPlanLabel}.`,
        reason: "limit_reached" as const
      };
    }

    return {
      allowed: true,
      message: null,
      reason: null
    };
  }

  if (action === "invite_user" && context.usage.users >= freemiumLimit.users) {
    return {
      allowed: false,
      message: `Você atingiu o limite de ${formatFiniteLimit(freemiumLimit.users)} usuários no plano ${freemiumPlanLabel}.`,
      reason: "limit_reached" as const
    };
  }

  const maxJobsLimit = context.effectiveStatus === "trial_expired" ? 100 : context.plan.max_jobs;

  if (action === "create_job" && maxJobsLimit != null && context.usage.jobs >= maxJobsLimit) {
    return {
      allowed: false,
      message: "Seu plano atual atingiu o limite de jobs. Faça upgrade para continuar criando novos jobs.",
      reason: "limit_reached" as const
    };
  }

  if (action === "ai_briefing") {
    if (!canUseAI(
      {
        plan: planCodeForLimits,
        status: context.subscription.status,
        trial_ends_at: context.subscription.trial_ends_at
      },
      context.usage.aiGenerations
    )) {
      return {
        allowed: false,
        message: `Você atingiu o limite de ${formatFiniteLimit(freemiumLimit.aiGenerations)} gerações de IA no plano ${freemiumPlanLabel}.`,
        reason: "limit_reached" as const
      };
    }

    return {
      allowed: true,
      message: null,
      reason: null
    };
  }

  const googleDriveEnabled = context.effectiveStatus === "trial_expired" ? false : context.plan.google_drive_enabled;

  if (action === "google_drive" && !googleDriveEnabled) {
    return {
      allowed: false,
      message: "A integração com Google Drive não está disponível no seu plano atual.",
      reason: "feature_unavailable" as const
    };
  }

  return {
    allowed: true,
    message: null,
    reason: null
  };
}

function mapAgencyStatusToSubscriptionStatus(status: Agency["status"]): CommercialSubscriptionStatus {
  if (status === "suspended") return "suspended";
  if (status === "trial") return "trial";
  if (status === "pending_payment") return "pending_payment";
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

async function countClients({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}) {
  const { count, error } = await supabase.from("clients").select("id", { count: "exact", head: true }).eq("agency_id", agencyId);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
}

async function countAiGenerations({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}) {
  const aiLogsResponse = await supabase.from("ai_logs").select("id", { count: "exact", head: true }).eq("agency_id", agencyId);

  if (!aiLogsResponse.error) {
    return aiLogsResponse.count ?? 0;
  }

  const fallbackResponse = await supabase
    .from("ai_actions_log")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", agencyId)
    .eq("action_type", "generate_briefing")
    .eq("status", "success");

  if (fallbackResponse.error) {
    if (
      isMissingSupabaseTable(fallbackResponse.error.message, "ai_actions_log") ||
      fallbackResponse.error.message.toLowerCase().includes("permission denied")
    ) {
      return 0;
    }

    throw new Error(fallbackResponse.error.message);
  }

  return fallbackResponse.count ?? 0;
}

async function buildLegacyCommercialContext({
  supabase,
  agencyId
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
}): Promise<AgencyCommercialContext> {
  const [{ data: rawAgency, error: agencyError }, { count: usersCount }, jobsCount, clientsCount, aiGenerations] = await Promise.all([
    fetchAgencyCommercialBase<Pick<Agency, "id" | "name" | "plan" | "status" | "created_at"> & AgencyCommercialBase>({
      supabase,
      agencyId,
      selectWithTrialColumns: "id, name, plan, status, trial_activated, created_at, trial_starts_at, trial_ends_at",
      selectWithoutTrialColumns: "id, name, plan, status, created_at"
    }),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    countActiveJobs({ supabase, agencyId }),
    countClients({ supabase, agencyId }),
    countAiGenerations({ supabase, agencyId })
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
    jobs: jobsCount,
    clients: clientsCount,
    aiGenerations
  };
  const effectiveStatus: EffectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);

  const trialActivated = isTrialActivated({
    trial_activated: rawAgency.trial_activated,
    trial_starts_at: subscription.trial_started_at ?? rawAgency.trial_starts_at,
    trial_ends_at: subscription.trial_ends_at ?? rawAgency.trial_ends_at
  });
  const trialEndDate = subscription.trial_ends_at ?? rawAgency.trial_ends_at;
  const trialActive = trialActivated && isTrialActive({ trialEndDate });
  const trialExpired = effectiveStatus === "trial_expired";
  const trial = {
    activated: trialActivated,
    active: trialActive,
    expired: trialExpired,
    daysLeft: trialActivated ? getTrialDaysLeft({ trialEndDate }) : 0
  };

  const baseContext: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus" | "trial"> = {
    plan,
    subscription,
    usage,
    effectiveStatus,
    trial
  };

  return {
    ...baseContext,
    trial,
    readOnlyMode: ["past_due", "canceled", "suspended", "pending_payment"].includes(effectiveStatus),
    permissions: {
      create_job: evaluateCommercialAction(baseContext, "create_job"),
      create_task: evaluateCommercialAction(baseContext, "create_task"),
      create_client: evaluateCommercialAction(baseContext, "create_client"),
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
  const [
    { data: rawAgency, error: agencyError },
    { data: rawSubscription, error: subscriptionError },
    { count: usersCount },
    jobsCount,
    clientsCount,
    aiGenerations
  ] = await Promise.all([
    fetchAgencyCommercialBase<Pick<Agency, "id"> & AgencyCommercialBase>({
      supabase,
      agencyId,
      selectWithTrialColumns: "id, trial_activated, trial_starts_at, trial_ends_at",
      selectWithoutTrialColumns: "id"
    }),
    supabase.from("agency_subscriptions").select("*").eq("agency_id", agencyId).maybeSingle(),
    supabase.from("users").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
    countActiveJobs({ supabase, agencyId }),
    countClients({ supabase, agencyId }),
    countAiGenerations({ supabase, agencyId })
  ]);

  if (agencyError || !rawAgency) {
    throw new Error(agencyError?.message ?? "Agência não encontrada para resolver permissões comerciais.");
  }

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
    jobs: jobsCount,
    clients: clientsCount,
    aiGenerations
  };
  const effectiveStatus: EffectiveSubscriptionStatus = resolveEffectiveSubscriptionStatus(subscription);

  const trialActivated = isTrialActivated({
    trial_activated: rawAgency.trial_activated,
    trial_starts_at: subscription.trial_started_at ?? rawAgency.trial_starts_at,
    trial_ends_at: subscription.trial_ends_at ?? rawAgency.trial_ends_at
  });
  const trialEndDate = subscription.trial_ends_at ?? rawAgency.trial_ends_at;
  const trialActive = trialActivated && isTrialActive({ trialEndDate });
  const trialExpired = effectiveStatus === "trial_expired";

  const trial = {
    activated: trialActivated,
    active: trialActive,
    expired: trialExpired,
    daysLeft: trialActivated ? getTrialDaysLeft({ trialEndDate }) : 0
  };

  const baseContext: Pick<AgencyCommercialContext, "plan" | "subscription" | "usage" | "effectiveStatus" | "trial"> = {
    plan,
    subscription,
    usage,
    effectiveStatus,
    trial
  };

  const permissions: AgencyCommercialContext["permissions"] = {
    create_job: evaluateCommercialAction(baseContext, "create_job"),
    create_task: evaluateCommercialAction(baseContext, "create_task"),
    create_client: evaluateCommercialAction(baseContext, "create_client"),
    invite_user: evaluateCommercialAction(baseContext, "invite_user"),
    ai_briefing: evaluateCommercialAction(baseContext, "ai_briefing"),
    google_drive: evaluateCommercialAction(baseContext, "google_drive")
  };

  return {
    ...baseContext,
    readOnlyMode: ["past_due", "canceled", "suspended", "pending_payment"].includes(effectiveStatus),
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
    reason: permission.reason,
    context
  };
}
