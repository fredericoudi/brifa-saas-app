import Link from "next/link";
import { AgencyStatusToggleButton } from "@/components/master/agency-status-toggle-button";
import { CopyLinkButton } from "@/components/master/copy-link-button";
import { MasterAgencyForm } from "@/components/master/master-agency-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { resolveAgencyPortalPath, resolvePlatformPath } from "@/lib/agency-routing";
import { COMMERCIAL_STATUS_LABEL, COMMERCIAL_STATUS_VARIANT, resolveEffectiveSubscriptionStatus } from "@/lib/commercial";
import { getPlatformActivationLink, getPlatformOverviewData } from "@/lib/platform-admin";
import { formatDate } from "@/lib/utils";

export default async function PlatformAgenciesPage() {
  const {
    agencyList,
    origin,
    pendingInvitations,
    subscriptionsByAgency,
    plansById,
    userCountByAgency,
    activePlanOptions
  } = await getPlatformOverviewData();

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card id="cadastro">
          <CardHeader>
            <h2 className="text-base font-semibold">Cadastrar agência</h2>
            <p className="mt-1 text-sm text-muted">
              Crie uma nova agência, gere o link de ativação e mantenha todo o SaaS dentro do mesmo app.
            </p>
          </CardHeader>
          <CardContent>
            <MasterAgencyForm
              mode="create"
              initialValues={{
                name: "",
                slug: "",
                plan: "starter",
                status: "active",
                adminEmail: "",
                adminName: "",
                trialStartsAt: "",
                trialEndsAt: ""
              }}
              planOptions={activePlanOptions}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Gestão centralizada de agências</h2>
            <p className="mt-1 text-sm text-muted">
              Esta lista fica isolada do painel da agência e mostra a operação inteira da plataforma.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-panelAlt/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Caminho oficial</p>
                <p className="mt-2 text-sm font-medium text-text">{resolvePlatformPath()}</p>
                <p className="mt-1 text-sm text-muted">Use este endereço como entrada padrão do painel master.</p>
              </div>
              <div className="rounded-2xl border border-border bg-panelAlt/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Permissão</p>
                <p className="mt-2 text-sm font-medium text-text">platform_role = super_admin</p>
                <p className="mt-1 text-sm text-muted">Acesso restrito por middleware e também no layout server-side.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Agências cadastradas</h2>
          <p className="mt-1 text-sm text-muted">Listagem global das agências com ativação, plano, status e acesso rápido.</p>
        </CardHeader>
        <CardContent>
          {agencyList.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma agência encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1120px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Nome</th>
                    <th className="py-2">Slug</th>
                    <th className="py-2">Plano</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Usuários</th>
                    <th className="py-2">Data de criação</th>
                    <th className="py-2">Link de ativação</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {agencyList.map((agency) => {
                    const subscription = subscriptionsByAgency.get(agency.id) ?? null;
                    const plan = subscription ? plansById.get(subscription.plan_id) ?? null : null;
                    const effectiveStatus = subscription ? resolveEffectiveSubscriptionStatus(subscription) : "active";
                    const activationLink = getPlatformActivationLink({
                      agencyId: agency.id,
                      slug: agency.slug,
                      origin,
                      invitations: pendingInvitations
                    });
                    const portalPath = resolveAgencyPortalPath(agency.slug);

                    return (
                      <tr key={agency.id} className="border-b border-border/70 align-top">
                        <td className="py-3">
                          <Link href={resolvePlatformPath(`/agencies/${agency.id}`)} className="font-medium text-text hover:text-brand">
                            {agency.name}
                          </Link>
                        </td>
                        <td className="py-3 text-muted">/{agency.slug}</td>
                        <td className="py-3 text-muted">{plan?.name ?? "Sem plano"}</td>
                        <td className="py-3">
                          <Badge variant={COMMERCIAL_STATUS_VARIANT[effectiveStatus]}>
                            {COMMERCIAL_STATUS_LABEL[effectiveStatus]}
                          </Badge>
                        </td>
                        <td className="py-3 text-muted">{userCountByAgency.get(agency.id) ?? 0}</td>
                        <td className="py-3 text-muted">{formatDate(agency.created_at)}</td>
                        <td className="py-3">
                          {activationLink ? (
                            <div className="flex max-w-xs flex-col gap-2">
                              <p className="truncate font-mono text-xs text-muted">{activationLink}</p>
                              <CopyLinkButton value={activationLink} />
                            </div>
                          ) : (
                            <span className="text-xs text-muted">Sem link pendente</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            {portalPath ? (
                              <Link
                                href={portalPath}
                                className="inline-flex h-8 items-center justify-center rounded-xl bg-brand px-3 text-xs font-medium text-white transition hover:opacity-95"
                              >
                                Portal da agência
                              </Link>
                            ) : (
                              <Link
                                href={`${resolvePlatformPath(`/agencies/${agency.id}`)}#editar`}
                                className="inline-flex h-8 items-center justify-center rounded-xl bg-amber-100 px-3 text-xs font-medium text-amber-800 transition hover:bg-amber-200"
                              >
                                Configurar slug
                              </Link>
                            )}
                            <Link
                              href={resolvePlatformPath(`/agencies/${agency.id}`)}
                              className="inline-flex h-8 items-center justify-center rounded-xl bg-panelAlt px-3 text-xs font-medium text-text transition hover:bg-panel"
                            >
                              Ver detalhes
                            </Link>
                            <Link
                              href={`${resolvePlatformPath(`/agencies/${agency.id}`)}#editar`}
                              className="inline-flex h-8 items-center justify-center rounded-xl bg-panelAlt px-3 text-xs font-medium text-text transition hover:bg-panel"
                            >
                              Editar
                            </Link>
                            <AgencyStatusToggleButton
                              agency={{
                                id: agency.id,
                                status: agency.status
                              }}
                            />
                          </div>
                        </td>
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
