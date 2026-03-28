import Link from "next/link";
import { Archive, ArrowRight, Building2, CreditCard, Grid2x2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { COMMERCIAL_STATUS_LABEL, COMMERCIAL_STATUS_VARIANT, resolveEffectiveSubscriptionStatus } from "@/lib/commercial";
import { getPlatformOverviewData } from "@/lib/platform-admin";
import { formatDate } from "@/lib/utils";

const quickLinks = [
  {
    href: "/platform/agencies",
    title: "Agências",
    description: "Abra o painel unificado com listagem, cadastro, slug, ativação e edição das contas.",
    icon: Building2
  },
  {
    href: "/platform/archived",
    title: "Arquivados",
    description: "Consulte os jobs arquivados por agência e mantenha o histórico centralizado.",
    icon: Archive
  },
  {
    href: "/platform/plans",
    title: "Configurar planos",
    description: "Revise limites comerciais, preço mensal e recursos habilitados.",
    icon: Grid2x2
  },
  {
    href: "/platform/subscriptions",
    title: "Assinaturas",
    description: "Acompanhe trial, renovação e status financeiro.",
    icon: CreditCard
  },
  {
    href: "/platform/users",
    title: "Usuários",
    description: "Veja a ocupação da base e o tipo de acesso de cada perfil.",
    icon: Users
  }
] as const;

export default async function PlatformDashboardPage() {
  const {
    latestAgencies,
    subscriptionsByAgency,
    totalAgencies,
    activeAgencies,
    trialAgencies,
    canceledAgencies,
    totalUsers,
    totalJobs,
    totalTasks,
    jobsByMonth
  } = await getPlatformOverviewData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Total de agências" value={totalAgencies} />
        <MetricCard title="Agências ativas" value={activeAgencies} />
        <MetricCard title="Planos cancelados" value={canceledAgencies} />
        <MetricCard title="Agências em trial" value={trialAgencies} />
        <MetricCard title="Total de usuários" value={totalUsers} />
        <MetricCard title="Total de jobs" value={totalJobs} />
        <MetricCard title="Total de tarefas" value={totalTasks} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Visão geral da plataforma</h2>
            <p className="mt-1 text-sm text-muted">
              Esta área concentra a operação comercial do SaaS sem interferir no painel operacional de cada agência.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              {quickLinks.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group rounded-2xl border border-border bg-panelAlt/50 p-4 transition hover:border-slate-300 hover:bg-panel"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <Icon className="h-4 w-4" />
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-text">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted">{item.description}</p>
                  </Link>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Últimas agências cadastradas</h2>
                <p className="mt-1 text-sm text-muted">Acompanhe rapidamente as contas mais recentes.</p>
              </div>
              <Link href="/platform/agencies" className="text-sm font-medium text-brand hover:opacity-80">
                Ver todas
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {latestAgencies.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma agência cadastrada até o momento.</p>
            ) : (
              <div className="space-y-3">
                {latestAgencies.map((agency) => {
                  const subscription = subscriptionsByAgency.get(agency.id);
                  const effectiveStatus = subscription ? resolveEffectiveSubscriptionStatus(subscription) : "active";

                  return (
                    <Link
                      key={agency.id}
                      href={`/platform/agencies/${agency.id}`}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-border p-4 transition hover:bg-panelAlt/60"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text">{agency.name}</p>
                        <p className="truncate text-xs text-muted">
                          /{agency.slug} • {formatDate(agency.created_at)}
                        </p>
                      </div>
                      <Badge variant={COMMERCIAL_STATUS_VARIANT[effectiveStatus]}>
                        {COMMERCIAL_STATUS_LABEL[effectiveStatus]}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Jobs criados por mês</h2>
            <p className="mt-1 text-sm text-muted">Consolidação mensal de jobs gerados por todas as agências.</p>
          </CardHeader>
          <CardContent>
            {jobsByMonth.length === 0 ? (
              <p className="text-sm text-muted">Ainda não existem jobs suficientes para formar um histórico mensal.</p>
            ) : (
              <div className="space-y-3">
                {jobsByMonth.map((month) => (
                  <div key={month.key} className="flex items-center justify-between rounded-2xl border border-border bg-panelAlt/50 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-text">{month.label}</p>
                      <p className="text-xs text-muted">Todas as agências</p>
                    </div>
                    <Badge variant="brand">{month.total} jobs</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Cadastros recentes</h2>
            <p className="mt-1 text-sm text-muted">
              Acompanhe os últimos movimentos comerciais antes de abrir a gestão completa das agências.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <Link
                href="/platform/agencies#cadastro"
                className="rounded-2xl border border-border bg-panelAlt/50 p-4 transition hover:bg-panel"
              >
                <p className="text-sm font-semibold text-text">Cadastrar nova agência</p>
                <p className="mt-1 text-sm text-muted">Inclui slug, plano, status, trial e administrador inicial.</p>
              </Link>
              <Link
                href="/platform/plans"
                className="rounded-2xl border border-border bg-panelAlt/50 p-4 transition hover:bg-panel"
              >
                <p className="text-sm font-semibold text-text">Configurar planos</p>
                <p className="mt-1 text-sm text-muted">Revise Starter, Pro, Agency e os limites comerciais.</p>
              </Link>
              <Link
                href="/platform/agencies"
                className="rounded-2xl border border-border bg-panelAlt/50 p-4 transition hover:bg-panel"
              >
                <p className="text-sm font-semibold text-text">Agências</p>
                <p className="mt-1 text-sm text-muted">Acesse a listagem completa, o cadastro, os links de ativação e o portal por slug.</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
