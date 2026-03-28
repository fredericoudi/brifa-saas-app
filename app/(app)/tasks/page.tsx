"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, Eye, EyeOff, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/loading";
import { Select } from "@/components/ui/select";
import type { Job, UserProfile } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatDate, JOB_STATUS_LABEL } from "@/lib/utils";

type JobStatus = Job["status"];
type SortMode = "entrada_desc" | "entrada_asc" | "entrega_asc" | "entrega_desc";

type JobWithClient = Pick<
  Job,
  "id" | "agency_id" | "client_id" | "title" | "job_code" | "status" | "created_at" | "due_date" | "due_time"
> & {
  client: { id: string; name: string } | null;
};

type JobAssigneeRelation = {
  user_id: string;
  user: { id: string; name: string } | null;
  task: { job_id: string } | null;
};

type JobViewRelation = {
  job_id: string;
  user_id: string;
};

type JobListItem = JobWithClient & {
  clientName: string | null;
  seenByResponsible: boolean;
  assignees: Array<{ id: string; name: string }>;
};

function compareJobs(a: JobListItem, b: JobListItem, mode: SortMode) {
  if (mode === "entrada_asc") {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }

  if (mode === "entrada_desc") {
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  }

  const aDue = a.due_date ? new Date(`${a.due_date}T${a.due_time?.slice(0, 5) || "23:59"}:00`).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? new Date(`${b.due_date}T${b.due_time?.slice(0, 5) || "23:59"}:00`).getTime() : Number.POSITIVE_INFINITY;

  if (mode === "entrega_desc") {
    return bDue - aDue;
  }

  return aDue - bDue;
}

export default function TasksPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [sortMode, setSortMode] = useState<SortMode>("entrada_desc");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("todos");
  const [clientFilter, setClientFilter] = useState<string>("todos");

  async function loadData() {
    setError("");

    try {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada.");
        return;
      }

      const { data: currentProfile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !currentProfile) {
        setError("Perfil não encontrado.");
        return;
      }

      const typedProfile = currentProfile as UserProfile;

      setProfile(typedProfile);
      setAssigneeFilter(typedProfile.role === "admin" ? "todos" : typedProfile.id);

      let jobsResponse = await supabase
        .from("jobs")
        .select(
          "id, agency_id, client_id, title, job_code, status, created_at, due_date, due_time, archived_at, client:clients(id, name)"
        )
        .eq("agency_id", typedProfile.agency_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (jobsResponse.error && isMissingJobsArchivedAtColumn(jobsResponse.error.message)) {
        jobsResponse = await supabase
          .from("jobs")
          .select("id, agency_id, client_id, title, job_code, status, created_at, due_date, due_time, client:clients(id, name)")
          .eq("agency_id", typedProfile.agency_id)
          .order("created_at", { ascending: false });
      }

      const [
        { data: assigneesData, error: assigneesError },
        { data: viewsData, error: viewsError },
        { data: usersData, error: usersError },
        { data: clientsData, error: clientsError }
      ] = await Promise.all([
        supabase
          .from("task_assignees")
          .select("user_id, user:users(id, name), task:tasks!inner(job_id)")
          .eq("agency_id", typedProfile.agency_id),
        supabase.from("job_views").select("job_id, user_id").eq("agency_id", typedProfile.agency_id),
        supabase
          .from("users")
          .select("id, name")
          .eq("agency_id", typedProfile.agency_id)
          .order("name", { ascending: true }),
        supabase
          .from("clients")
          .select("id, name")
          .eq("agency_id", typedProfile.agency_id)
          .order("name", { ascending: true })
      ]);

      if (jobsResponse.error) throw jobsResponse.error;
      if (assigneesError) throw assigneesError;
      if (viewsError) throw viewsError;
      if (usersError) throw usersError;
      if (clientsError) throw clientsError;

      const assigneesByJob = new Map<string, Set<string>>();
      const assigneeDetailsByJob = new Map<string, Array<{ id: string; name: string }>>();

      for (const relation of (assigneesData ?? []) as JobAssigneeRelation[]) {
        const jobId = relation.task?.job_id;
        if (!jobId) continue;

        const current = assigneesByJob.get(jobId) ?? new Set<string>();
        current.add(relation.user_id);
        assigneesByJob.set(jobId, current);

        const detailed = assigneeDetailsByJob.get(jobId) ?? [];
        if (!detailed.some((item) => item.id === relation.user_id)) {
          detailed.push({
            id: relation.user_id,
            name: relation.user?.name ?? "Membro"
          });
        }
        assigneeDetailsByJob.set(jobId, detailed);
      }

      const viewsByJob = new Map<string, Set<string>>();
      for (const relation of (viewsData ?? []) as JobViewRelation[]) {
        const current = viewsByJob.get(relation.job_id) ?? new Set<string>();
        current.add(relation.user_id);
        viewsByJob.set(relation.job_id, current);
      }

      const parsedJobs = ((jobsResponse.data as (JobWithClient & { archived_at?: string | null })[]) ?? [])
        .filter((job) => !job.archived_at)
        .map((job) => {
        const responsibleUsers = assigneesByJob.get(job.id) ?? new Set<string>();
        const seenUsers = viewsByJob.get(job.id) ?? new Set<string>();
        const seenByResponsible =
          responsibleUsers.size > 0 && [...responsibleUsers].some((assigneeId) => seenUsers.has(assigneeId));

        return {
          ...job,
          clientName: job.client?.name ?? null,
          seenByResponsible,
          assignees: assigneeDetailsByJob.get(job.id) ?? []
        };
      });

      setUsers((usersData ?? []) as Array<{ id: string; name: string }>);
      setClients((clientsData ?? []) as Array<{ id: string; name: string }>);
      setJobs(parsedJobs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar a lista de tarefas.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function archiveJob(job: JobListItem) {
    if (profile?.role !== "admin") {
      setError("Somente administradores podem arquivar jobs.");
      return;
    }

    if (!confirm(`Deseja arquivar o job "${job.title}"?`)) return;

    try {
      setError("");
      const response = await fetch(`/api/jobs/${job.id}/archive`, {
        method: "PATCH"
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao arquivar job.");

      setJobs((prev) => prev.filter((item) => item.id !== job.id));
    } catch (archiveJobError) {
      setError(archiveJobError instanceof Error ? archiveJobError.message : "Falha ao arquivar job.");
    }
  }

  function renderStatus(status: JobStatus) {
    const variant =
      status === "finalizado"
        ? "success"
        : status === "aprovado"
          ? "brand"
          : status === "revisao"
            ? "warning"
            : "neutral";

    return <Badge variant={variant}>{JOB_STATUS_LABEL[status]}</Badge>;
  }

  const filteredJobs = useMemo(() => {
    const list = jobs.filter((job) => {
      if (profile?.role !== "admin" && !job.assignees.some((assignee) => assignee.id === profile?.id)) return false;
      if (statusFilter !== "todos" && job.status !== statusFilter) return false;
      if (clientFilter !== "todos" && job.client_id !== clientFilter) return false;
      if (assigneeFilter !== "todos" && !job.assignees.some((assignee) => assignee.id === assigneeFilter)) return false;
      return true;
    });

    return [...list].sort((a, b) => compareJobs(a, b, sortMode));
  }, [assigneeFilter, clientFilter, jobs, profile?.id, profile?.role, sortMode, statusFilter]);

  const assigneeOptions = useMemo(() => {
    if (profile?.role === "admin") return users;
    return users.filter((user) => user.id === profile?.id);
  }, [profile?.id, profile?.role, users]);

  if (loading) return <LoadingBlock text="Carregando tarefas..." />;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p> : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Tarefas da agência</h2>
          <p className="mt-1 text-sm text-muted">Filtre os jobs e abra cada tarefa para consultar briefing e prazo.</p>
        </CardHeader>
        <CardContent>
          {profile?.role !== "admin" ? (
            <p className="mb-3 rounded-xl bg-brand/5 px-3 py-2 text-xs text-brand">
              Você está vendo apenas os jobs com tarefas atribuídas a você. A edição fica disponível apenas para perfis
              administrativos.
            </p>
          ) : null}

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Ordenação</label>
                <Select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                <option value="entrada_desc">Entrada mais recente</option>
                <option value="entrada_asc">Entrada mais antiga</option>
                <option value="entrega_asc">Entrega mais próxima</option>
                <option value="entrega_desc">Entrega mais distante</option>
              </Select>
            </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Status</label>
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="todos">Todos</option>
                <option value="briefing">Briefing</option>
                <option value="criacao">Criação</option>
                <option value="revisao">Revisão</option>
                <option value="aprovado">Aprovado</option>
                <option value="finalizado">Finalizado</option>
              </Select>
            </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Responsável</label>
                <Select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                disabled={profile?.role !== "admin"}
              >
                {profile?.role === "admin" ? <option value="todos">Todos</option> : null}
                {assigneeOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </Select>
            </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cliente</label>
                <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                <option value="todos">Todos</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Lista de tarefas ({filteredJobs.length})</h2>
        </CardHeader>
        <CardContent>
          {filteredJobs.length === 0 ? (
            <p className="text-sm text-muted">Nenhum job encontrado com os filtros atuais.</p>
          ) : (
            <div className="overflow-x-auto rounded-[24px] border border-border bg-panelAlt/35 p-2">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.16em] text-muted">
                    <th className="rounded-l-[18px] bg-panel px-4 py-3 text-center">Visto</th>
                    <th className="bg-panel px-4 py-3">Job</th>
                    <th className="bg-panel px-4 py-3">Cliente</th>
                    <th className="bg-panel px-4 py-3">Responsável</th>
                    <th className="bg-panel px-4 py-3">Status</th>
                    <th className="bg-panel px-4 py-3">Início</th>
                    <th className="bg-panel px-4 py-3">Entrega</th>
                    <th className="rounded-r-[18px] bg-panel px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-b-0">
                  {filteredJobs.map((job) => (
                    <tr
                      key={job.id}
                      className="group cursor-pointer border-b border-border/60 transition hover:bg-white/80 focus-visible:bg-white/80"
                      onClick={() => router.push(`/jobs/${job.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(`/jobs/${job.id}`);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`Abrir job ${job.title}`}
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-center">
                          {job.seenByResponsible ? (
                            <span title="Visualizado">
                              <Eye className="h-4 w-4 text-brand" aria-label="Visualizado" />
                            </span>
                          ) : (
                            <span title="Ainda não visualizado">
                              <EyeOff className="h-4 w-4 text-muted" aria-label="Ainda não visualizado" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 font-medium">
                        <span className="transition group-hover:text-brand">{job.title}</span>
                        {job.job_code ? <p className="text-xs text-muted">{job.job_code}</p> : null}
                      </td>
                      <td className="px-4 py-4 text-muted">{job.clientName ?? "-"}</td>
                      <td className="px-4 py-4 text-muted">
                        {job.assignees.length > 0 ? job.assignees.map((assignee) => assignee.name).join(", ") : "-"}
                      </td>
                      <td className="px-4 py-4">{renderStatus(job.status)}</td>
                      <td className="px-4 py-4 text-muted">{new Date(job.created_at).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-4 text-muted">
                        {formatDate(job.due_date)}
                        {job.due_time ? <p className="text-xs">às {job.due_time.slice(0, 5)}</p> : null}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {profile?.role === "admin" ? (
                            <>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/jobs?edit=${job.id}`);
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-border bg-panel text-text transition hover:bg-panelAlt"
                                aria-label={`Editar ${job.title}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void archiveJob(job);
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-[16px] border border-border bg-panel text-text transition hover:bg-panelAlt"
                                aria-label={`Arquivar ${job.title}`}
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </>
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
