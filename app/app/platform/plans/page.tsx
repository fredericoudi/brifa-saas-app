import { PlatformPlansManager } from "@/components/platform/platform-plans-manager";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isManageableCommercialPlanCode } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export default async function PlatformPlansPage() {
  const admin = createAdminSupabaseClient();
  const { data: plans } = await admin.from("plans").select("*").order("price_monthly", { ascending: true });

  const planList = (plans ?? []).filter((plan) => isManageableCommercialPlanCode(plan.code));

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Planos comerciais</h2>
          <p className="mt-1 text-sm text-muted">
            Consulte os limites e ajuste o valor mensal de cada plano sempre que a estratégia comercial mudar.
          </p>
        </CardHeader>
        <CardContent>
          <PlatformPlansManager plans={planList} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Escopo dos planos ativos</h2>
          <p className="mt-1 text-sm text-muted">O plano growth foi mantido apenas como legado técnico e saiu da operação comercial do SaaS.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="neutral">Starter</Badge>
            <Badge variant="neutral">Pro</Badge>
            <Badge variant="neutral">Agency</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
