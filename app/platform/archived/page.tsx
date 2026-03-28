import Link from "next/link";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { getPlatformArchivedJobsData } from "@/lib/platform-admin";
import { formatDate, JOB_STATUS_LABEL } from "@/lib/utils";

export default async function PlatformArchivedPage() {
  const { archivedJobs, migrationRequired, totalArchivedJobs = 0, archivedAgenciesCount = 0, archivedThisMonth = 0 } =
    await getPlatformArchivedJobsData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Jobs arquivados" value={totalArchivedJobs} />
        <MetricCard title="Agências com arquivados" value={archivedAgenciesCount} />
        <MetricCard title="Arquivados no mês" value={archivedThisMonth} />
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Arquivados da plataforma</h2>
          <p className="mt-1 text-sm text-muted">
            Visualização global dos jobs arquivados para preservar histórico, auditoria e consulta administrativa.
          </p>
        </CardHeader>
        <CardContent>
          {migrationRequired ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              O banco ainda não recebeu a migration de arquivamento. Rode a migration mais recente no Supabase para liberar esta visão.
            </div>
          ) : archivedJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-panelAlt/30 px-4 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-panelAlt text-muted">
                <Archive className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-text">Nenhum job arquivado até o momento.</p>
              <p className="mt-1 text-sm text-muted">Quando uma agência arquivar jobs, eles passarão a aparecer aqui.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Agência</th>
                    <th className="py-2">Job</th>
                    <th className="py-2">Cliente</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Entrega</th>
                    <th className="py-2">Arquivado em</th>
                    <th className="py-2">Arquivado por</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedJobs.map((job) => (
                    <tr key={job.id} className="border-b border-border/70 align-top">
                      <td className="py-3">
                        {job.agency ? (
                          <div>
                            <p className="font-medium text-text">{job.agency.name}</p>
                            <p className="text-xs text-muted">/{job.agency.slug}</p>
                          </div>
                        ) : (
                          <span className="text-muted">Agência removida</span>
                        )}
                      </td>
                      <td className="py-3">
                        <p className="font-medium text-text">{job.title}</p>
                        <p className="text-xs text-muted">{job.job_code ?? "Sem código"}</p>
                      </td>
                      <td className="py-3 text-muted">{job.client?.name ?? "Sem cliente"}</td>
                      <td className="py-3">
                        <Badge variant="neutral">{JOB_STATUS_LABEL[job.status as keyof typeof JOB_STATUS_LABEL] ?? job.status}</Badge>
                      </td>
                      <td className="py-3 text-muted">{job.due_date ? formatDate(job.due_date) : "Sem prazo"}</td>
                      <td className="py-3 text-muted">{job.archived_at ? formatDate(job.archived_at) : "-"}</td>
                      <td className="py-3 text-muted">{job.archived_by_user?.name ?? "Não identificado"}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          {job.agency ? (
                            <Link
                              href={`/platform/agencies/${job.agency.id}`}
                              className="inline-flex h-8 items-center justify-center rounded-xl bg-panelAlt px-3 text-xs font-medium text-text transition hover:bg-panel"
                            >
                              Ver agência
                            </Link>
                          ) : null}
                        </div>
                      </td>
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
