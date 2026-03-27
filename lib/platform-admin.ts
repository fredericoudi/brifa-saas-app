import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { isManageableCommercialPlanCode, normalizeCommercialPlanCode, resolveEffectiveSubscriptionStatus } from "@/lib/commercial";
import { getPendingActivationInvitation } from "@/lib/master";
import { getRequestOrigin } from "@/lib/master-server";

export async function getPlatformOverviewData() {
  const admin = createAdminSupabaseClient();
  const origin = getRequestOrigin();

  const [
    { data: agencies },
    { data: users },
    { data: invitations },
    { data: subscriptions },
    { data: plans },
    { data: jobsByCreatedAt },
    { count: totalJobs },
    { count: totalTasks }
  ] = await Promise.all([
    admin.from("agencies").select("*").order("created_at", { ascending: false }),
    admin.from("users").select("id, agency_id"),
    admin
      .from("agency_invitations")
      .select("*")
      .eq("invitation_type", "agency_admin_activation")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin.from("agency_subscriptions").select("*"),
    admin.from("plans").select("*").order("price_monthly", { ascending: true }),
    admin.from("jobs").select("created_at").order("created_at", { ascending: true }),
    admin.from("jobs").select("id", { count: "exact", head: true }),
    admin.from("tasks").select("id", { count: "exact", head: true })
  ]);

  const agencyList = agencies ?? [];
  const userList = users ?? [];
  const pendingInvitations = invitations ?? [];
  const subscriptionList = subscriptions ?? [];
  const planList = plans ?? [];
  const userCountByAgency = new Map<string, number>();
  const subscriptionsByAgency = new Map(subscriptionList.map((subscription) => [subscription.agency_id, subscription]));
  const plansById = new Map(planList.map((plan) => [plan.id, plan]));

  for (const user of userList) {
    userCountByAgency.set(user.agency_id, (userCountByAgency.get(user.agency_id) ?? 0) + 1);
  }

  const activePlanOptions = planList
    .filter((plan) => plan.active)
    .map((plan) => {
      const code = normalizeCommercialPlanCode(plan.code);
      return code && isManageableCommercialPlanCode(code) ? { code, name: plan.name } : null;
    })
    .filter((plan): plan is { code: "starter" | "pro" | "agency"; name: string } => Boolean(plan));

  const jobsPerMonthMap = new Map<string, number>();
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" });

  for (const job of jobsByCreatedAt ?? []) {
    const date = new Date(job.created_at);
    const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    jobsPerMonthMap.set(monthKey, (jobsPerMonthMap.get(monthKey) ?? 0) + 1);
  }

  const jobsByMonth = Array.from(jobsPerMonthMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-6)
    .map(([key, total]) => {
      const [year, month] = key.split("-").map(Number);
      const label = formatter.format(new Date(Date.UTC(year, month - 1, 1)));

      return {
        key,
        label: label.charAt(0).toUpperCase() + label.slice(1),
        total
      };
    });

  const canceledAgencies = subscriptionList.filter(
    (subscription) => resolveEffectiveSubscriptionStatus(subscription) === "canceled"
  ).length;

  return {
    origin,
    agencyList,
    userList,
    pendingInvitations,
    subscriptionList,
    planList,
    totalJobs: totalJobs ?? 0,
    totalTasks: totalTasks ?? 0,
    userCountByAgency,
    subscriptionsByAgency,
    plansById,
    activePlanOptions,
    totalAgencies: agencyList.length,
    activeAgencies: subscriptionList.filter((subscription) => resolveEffectiveSubscriptionStatus(subscription) === "active").length,
    trialAgencies: subscriptionList.filter((subscription) => resolveEffectiveSubscriptionStatus(subscription) === "trial").length,
    canceledAgencies,
    totalUsers: userList.length,
    latestAgencies: agencyList.slice(0, 5),
    jobsByMonth
  };
}

export function getPlatformActivationLink({
  agencyId,
  slug,
  origin,
  invitations
}: {
  agencyId: string;
  slug: string;
  origin: string;
  invitations: Parameters<typeof getPendingActivationInvitation>[0];
}) {
  const pendingInvitation = getPendingActivationInvitation(invitations, agencyId);

  if (!pendingInvitation) {
    return null;
  }

  const params = new URLSearchParams({
    agency: slug,
    token: pendingInvitation.token
  });

  return `${origin.replace(/\/$/, "")}/ativar?${params.toString()}`;
}
