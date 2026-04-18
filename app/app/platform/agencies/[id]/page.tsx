import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLinkButton } from "@/components/master/copy-link-button";
import { MasterAgencyForm } from "@/components/master/master-agency-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { resolveAgencyPortalPath, resolvePlatformPath } from "@/lib/agency-routing";
import {
  COMMERCIAL_STATUS_LABEL,
  COMMERCIAL_STATUS_VARIANT,
  isManageableCommercialPlanCode,
  normalizeCommercialPlanCode,
  resolveEffectiveSubscriptionStatus
} from "@/lib/commercial";
import { AGENCY_STATUS_LABEL, buildAgencyActivationLink } from "@/lib/master";
import { getRequestOrigin } from "@/lib/master-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/utils";

function getStatusVariant(status: "active" | "inactive" | "suspended" | "trial" | "pending_payment") {
  if (status === "active") return "success" as const;
  if (status === "trial") return "brand" as const;
  if (status === "suspended") return "danger" as const;
  if (status === "pending_payment") return "warning" as const;
  return "neutral" as const;
}

export default async function PlatformAgencyDetailsPage({ params }: { params: { id: string } }) {
  const admin = createAdminSupabaseClient();
  const origin = getRequestOrigin();

  const [
    { data: agency },
    { data: users },
    { data: pendingInvitation },
    { data: subscription },
    { data: plans },
    { count: jobsCount },
    { count: tasksCount }
  ] = await Promise.all([
    admin.from("agencies").select("*").eq("id", params.id).maybeSingle(),
    admin
      .from("users")
      .select("id, name, email, role, agency_role, created_at")
      .eq("agency_id", params.id)
      .order("created_at", { ascending: true }),
    admin
      .from("agency_invitations")
      .select("*")
      .eq("agency_id", params.id)
      .eq("invitation_type", "agency_admin_activation")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .maybeSingle(),
    admin.from("agency_subscriptions").select("*").eq("agency_id", params.id).maybeSingle(),
    admin.from("plans").select("*").order("price_monthly", { ascending: true }),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", params.id),
    admin.from("tasks").select("id", { count: "exact", head: true }).eq("agency_id", params.id)
  ]);

  if (!agency) {
    notFound();
  }

  const agencyUsers = users ?? [];
  const planList = plans ?? [];
  const resolvedSubscription = subscription ?? null;
  const currentPlan = resolvedSubscription ? planList.find((plan) => plan.id === resolvedSubscription.plan_id) ?? null : null;
  const effectiveStatus = resolvedSubscription ? resolveEffectiveSubscriptionStatus(resolvedSubscription) : "active";
  const planOptions = planList
    .filter((plan) => plan.active || plan.id === currentPlan?.id)
    .map((plan) => {
      const code = normalizeCommercialPlanCode(plan.code);
      const shouldInclude = code && (isManageableCommercialPlanCode(code) || plan.id === currentPlan?.id);
      return shouldInclude && code ? { code, name: plan.name } : null;
    })
    .filter((plan): plan is { code: "starter" | "pro" | "agency" | "growth"; name: string } => Boolean(plan));
  const primaryAdmin = agencyUsers.find((user) => user.role === "admin") ?? null;
  const activationLink = pendingInvitation
    ? buildAgencyActivationLink({
        origin,
        slug: agency.slug,
        token: pendingInvitation.token
      })
    : null;
  const portalPath = resolveAgencyPortalPath(agency.slug);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href={resolvePlatformPath("/agencies")} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:opacity-80">
          ← Voltar para agências
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">Painel Master / Agência</p>
            <h1 className="text-2xl font-semibold text-text">{agency.name}</h1>
            <p className="mt-1 text-sm text-muted">
              /{agency.slug} • criada em {formatDate(agency.created_at)}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant={COMMERCIAL_STATUS_VARIANT[effectiveStatus]}>{COMMERCIAL_STATUS_LABEL[effectiveStatus]}</Badge>
            <Badge variant="neutral">{currentPlan?.name ?? "Sem plano"}</Badge>
            <Badge variant={getStatusVariant(agency.status)}>Painel {AGENCY_STATUS_LABEL[agency.status]}</Badge>
          </div>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="Usuários vinculados" value={agencyUsers.length} />
        <MetricCard title="Jobs cadastrados" value={jobsCount ?? 0} />
        <MetricCard title="Tarefas cadastradas" value={tasksCount ?? 0} />
        <MetricCard title="Status da assinatura" value={COMMERCIAL_STATUS_LABEL[effectiveStatus]} />
        <MetricCard title="Plano atual" value={currentPlan?.name ?? "Sem plano"} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Resumo da agência</h2>
            <p className="mt-1 text-sm text-muted">Visão consolidada da operação e da ativação inicial.</p>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Nome</dt>
                <dd className="text-right font-medium text-text">{agency.name}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Slug</dt>
                <dd className="text-right font-medium text-text">/{agency.slug}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Portal da agência</dt>
                <dd className="text-right">
                  {portalPath ? (
                    <Link href={portalPath} className="font-medium text-brand hover:opacity-80">
                      /{agency.slug}
                    </Link>
                  ) : (
                    <Link href="#editar" className="font-medium text-amber-700 hover:opacity-80">
                      Configurar slug válido
                    </Link>
                  )}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Administrador inicial</dt>
                <dd className="text-right text-text">
                  {pendingInvitation?.email ?? primaryAdmin?.email ?? "Ainda não definido"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Status operacional</dt>
                <dd className="text-right text-text">{AGENCY_STATUS_LABEL[agency.status]}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Período de trial</dt>
                <dd className="text-right text-text">
                  {resolvedSubscription?.trial_started_at ? formatDate(resolvedSubscription.trial_started_at) : "Sem início"} até{" "}
                  {resolvedSubscription?.trial_ends_at ? formatDate(resolvedSubscription.trial_ends_at) : "Sem data final"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-border/70 pb-4">
                <dt className="text-muted">Próxima cobrança</dt>
                <dd className="text-right text-text">
                  {resolvedSubscription?.next_billing_date ? formatDate(resolvedSubscription.next_billing_date) : "A definir"}
                </dd>
              </div>
              <div className="space-y-2">
                <dt className="text-muted">Link de ativação</dt>
                <dd>
                  {activationLink ? (
                    <div className="space-y-3 rounded-2xl border border-border bg-panelAlt/60 p-4">
                      <p className="break-all font-mono text-xs text-muted">{activationLink}</p>
                      <CopyLinkButton value={activationLink} />
                    </div>
                  ) : (
                    <p className="text-muted">Nenhum link pendente. Gere um novo link abaixo se necessário.</p>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card id="editar">
          <CardHeader>
            <h2 className="text-base font-semibold">Editar agência</h2>
            <p className="mt-1 text-sm text-muted">Atualize dados da agência e regenere o link inicial quando precisar.</p>
          </CardHeader>
          <CardContent>
            <MasterAgencyForm
              mode="edit"
              agencyId={agency.id}
              initialActivationLink={activationLink}
              initialValues={{
                name: agency.name,
                slug: agency.slug,
                plan: normalizeCommercialPlanCode(currentPlan?.code ?? "starter") ?? "starter",
                status: resolvedSubscription?.status ?? "active",
                adminEmail: pendingInvitation?.email ?? primaryAdmin?.email ?? "",
                adminName: pendingInvitation?.name ?? primaryAdmin?.name ?? "",
                trialStartsAt: resolvedSubscription?.trial_started_at?.slice(0, 10) ?? "",
                trialEndsAt: resolvedSubscription?.trial_ends_at?.slice(0, 10) ?? ""
              }}
              planOptions={planOptions}
            />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Usuários vinculados</h2>
          <p className="mt-1 text-sm text-muted">Todos os usuários que já pertencem a esta agência.</p>
        </CardHeader>
        <CardContent>
          {agencyUsers.length === 0 ? (
            <p className="text-sm text-muted">Nenhum usuário vinculado ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Nome</th>
                    <th className="py-2">E-mail</th>
                    <th className="py-2">Role</th>
                    <th className="py-2">Função</th>
                    <th className="py-2">Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border/70">
                      <td className="py-3 font-medium text-text">{user.name}</td>
                      <td className="py-3 text-muted">{user.email}</td>
                      <td className="py-3">
                        <Badge variant={user.role === "admin" ? "brand" : "neutral"}>
                          {user.role === "admin" ? "Admin" : "Member"}
                        </Badge>
                      </td>
                      <td className="py-3 text-muted">{user.agency_role || "-"}</td>
                      <td className="py-3 text-muted">{formatDate(user.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
