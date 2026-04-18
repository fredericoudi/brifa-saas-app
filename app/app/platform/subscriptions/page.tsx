import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { COMMERCIAL_STATUS_LABEL, COMMERCIAL_STATUS_VARIANT, resolveEffectiveSubscriptionStatus } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

export default async function PlatformSubscriptionsPage() {
  const admin = createAdminSupabaseClient();
  const [{ data: subscriptions }, { data: agencies }, { data: plans }] = await Promise.all([
    admin.from("agency_subscriptions").select("*").order("created_at", { ascending: false }),
    admin.from("agencies").select("id, name, slug"),
    admin.from("plans").select("id, name")
  ]);

  const agencyMap = new Map((agencies ?? []).map((agency) => [agency.id, agency]));
  const planMap = new Map((plans ?? []).map((plan) => [plan.id, plan]));
  const subscriptionList = subscriptions ?? [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Assinaturas por agência</h2>
          <p className="mt-1 text-sm text-muted">Acompanhamento manual de trial, vigência, renovação e inadimplência.</p>
        </CardHeader>
        <CardContent>
          {subscriptionList.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma assinatura encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1080px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Agência</th>
                    <th className="py-2">Plano</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Início do trial</th>
                    <th className="py-2">Fim do trial</th>
                    <th className="py-2">Próxima cobrança</th>
                    <th className="py-2">Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptionList.map((subscription) => {
                    const agency = agencyMap.get(subscription.agency_id);
                    const plan = planMap.get(subscription.plan_id);
                    const effectiveStatus = resolveEffectiveSubscriptionStatus(subscription);

                    return (
                      <tr key={subscription.id} className="border-b border-border/70">
                        <td className="py-3">
                          <div>
                            <p className="font-medium text-text">{agency?.name ?? "Agência removida"}</p>
                            <p className="text-xs text-muted">/{agency?.slug ?? "sem-slug"}</p>
                          </div>
                        </td>
                        <td className="py-3 text-muted">{plan?.name ?? "Sem plano"}</td>
                        <td className="py-3">
                          <Badge variant={COMMERCIAL_STATUS_VARIANT[effectiveStatus]}>
                            {COMMERCIAL_STATUS_LABEL[effectiveStatus]}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted">{formatDate(subscription.trial_started_at)}</td>
                        <td className="py-3 text-muted">{formatDate(subscription.trial_ends_at)}</td>
                        <td className="py-3 text-muted">{formatDate(subscription.next_billing_date)}</td>
                        <td className="py-3 text-muted">{subscription.payment_provider || "Manual"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
