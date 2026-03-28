import Link from "next/link";
import { Archive } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { requireAuth } from "@/lib/auth";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDate, JOB_STATUS_LABEL } from "@/lib/utils";

type AgencyArchivedJob = {
  id: string;
  title: string;
  job_code: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  archived_at: string | null;
  client: { id: string; name: string } | null;
  archived_by_user: { id: string; name: string } | null;
};

export default async function ArchivedJobsPage() {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const response = await supabase
    .from("jobs")
    .select(
      "id, title, job_code, status, due_date, due_time, archived_at, client:clients(id, name), archived_by_user:users!jobs_archived_by_fkey(id, name)"
    )
    .eq("agency_id", profile.agency_id)
    .not("archived_at", "is", null)
    .order("archived_at", { ascending: false });

  if (response.error && !isMissingJobsArchivedAtColumn(response.error)) {
    throw new Error(response.error.message);
  }

  const migrationRequired = Boolean(response.error && isMissingJobsArchivedAtColumn(response.error));
  const archivedJobs = migrationRequired
    ? ([] as AgencyArchivedJob[])
    : (((response.data ?? []) as AgencyArchivedJob[]).filter((job) => Boolean(job.archived_at)));

  const archivedThisMonth = archivedJobs.filter((job) => {
    if (!job.archived_at) return false;
    const archivedDate = new Date(job.archived_at);
    const now = new Date();
    return archivedDate.getUTCFullYear() === now.getUTCFullYear() && archivedDate.getUTCMonth() === now.getUTCMonth();
  }).length;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Arquivados" value={archivedJobs.length} subtitle="Histórico preservado" />
        <MetricCard title="Arquivados no mês" value={archivedThisMonth} subtitle="Movimento recente" />
        <MetricCard title="Com prazo" value={archivedJobs.filter((job) => Boolean(job.due_date)).length} subtitle="Jobs com entrega registrada" />
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Jobs arquivados</h2>
          <p className="mt-1 text-sm text-muted">
            Consulte aqui o histórico dos jobs já concluídos ou retirados da operação ativa da agência.
          </p>
        </CardHeader>
        <CardContent>
          {migrationRequired ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              O arquivamento já está no app, mas o banco ainda precisa da migration de arquivamento para liberar esta visão.
            </div>
          ) : archivedJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-panelAlt/30 px-4 py-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-panelAlt text-muted">
                <Archive className="h-5 w-5" />
              </div>
              <p className="mt-4 text-sm font-medium text-text">Nenhum job arquivado por aqui ainda.</p>
              <p className="mt-1 text-sm text-muted">Quando um job for arquivado na operação, ele aparecerá nesta lista.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[980px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
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
                          <Link
                            href={`/jobs/${job.id}`}
                            className="inline-flex h-8 items-center justify-center rounded-xl bg-panelAlt px-3 text-xs font-medium text-text transition hover:bg-panel"
                          >
                            Abrir job
                          </Link>
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
