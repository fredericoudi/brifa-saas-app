"use client";

import { useRouter } from "next/navigation";
import { Archive, CalendarDays, Pencil, Zap } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/loading";
import { Select } from "@/components/ui/select";
import type { Job, UserProfile } from "@/lib/database.types";
import { getReadableErrorMessage, isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn, formatDate, getStatusBadgeVariant, JOB_STATUS_LABEL } from "@/lib/utils";

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

function parseDeadlineTimestamp(dueDate: string | null, dueTime: string | null) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const timePart = dueTime?.slice(0, 5) || "23:59";
  return new Date(`${dueDate}T${timePart}:00`).getTime();
}

function resolveDeadlineProgress(job: Pick<JobListItem, "created_at" | "due_date" | "due_time" | "status">) {
  if (job.status === "finalizado") return 100;
  if (!job.due_date) return 0;

  const now = Date.now();
  const end = parseDeadlineTimestamp(job.due_date, job.due_time);
  if (!Number.isFinite(end)) return 0;

  const start = new Date(job.created_at).getTime();
  const totalWindow = Math.max(end - start, 1);
  const elapsed = now - start;
  const progress = (elapsed / totalWindow) * 100;

  return Math.max(0, Math.min(100, Math.round(progress)));
}

function DeadlineProgressRing({ progress }: { progress: number }) {
  const size = 48;
  const strokeBase = 2;
  const strokeProgress = 5;
  const radius = (size - strokeProgress) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressLength = (circumference * progress) / 100;

  return (
    <span className="relative inline-flex h-12 w-12 items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-12 w-12">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#d0d0d0" strokeWidth={strokeBase} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--brand))"
          strokeWidth={strokeProgress}
          strokeLinecap="round"
          strokeDasharray={`${progressLength} ${circumference - progressLength}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Zap className="absolute h-5 w-5 text-brand" />
    </span>
  );
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

      if (jobsResponse.error && isMissingJobsArchivedAtColumn(jobsResponse.error)) {
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
      setError(getReadableErrorMessage(loadError, "Erro ao carregar a lista de tarefas."));
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
      setError(getReadableErrorMessage(archiveJobError, "Falha ao arquivar job."));
    }
  }

  function renderStatus(status: JobStatus) {
    return (
      <Badge
        variant={getStatusBadgeVariant(status)}
        className="min-w-[128px] justify-center px-4 py-2 text-[13px] font-semibold uppercase tracking-[0.05em]"
      >
        {JOB_STATUS_LABEL[status]}
      </Badge>
    );
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

      <Card className="border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.36)]">
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

            <div className="rounded-full bg-[#ececec] p-1.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.08)]">
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div>
                  <Select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value as SortMode)}
                    className="h-12 rounded-full border-border/70 bg-white shadow-none"
                  >
                    <option value="entrada_desc">Ordem</option>
                    <option value="entrada_asc">Entrada mais antiga</option>
                    <option value="entrega_asc">Entrega mais próxima</option>
                    <option value="entrega_desc">Entrega mais distante</option>
                  </Select>
                </div>

              <div>
                  <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-12 rounded-full border-border/70 bg-white shadow-none">
                    <option value="todos">Status</option>
                    <option value="briefing">Briefing</option>
                    <option value="criacao">Criação</option>
                    <option value="revisao">Revisão</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="finalizado">Finalizado</option>
                  </Select>
                </div>

              <div>
                <Select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    disabled={profile?.role !== "admin"}
                    className="h-12 rounded-full border-border/70 bg-white shadow-none"
                  >
                    {profile?.role === "admin" ? <option value="todos">Responsável</option> : null}
                    {assigneeOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </Select>
                </div>

              <div>
                  <Select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="h-12 rounded-full border-border/70 bg-white shadow-none">
                    <option value="todos">Cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.36)]">
        <CardContent className="px-0 py-0">
          {filteredJobs.length === 0 ? (
            <p className="px-6 py-6 text-sm text-muted">Nenhum job encontrado com os filtros atuais.</p>
          ) : (
            <div className="overflow-hidden rounded-[24px]">
              <div className="hidden xl:grid xl:grid-cols-[1.15fr_1.1fr_0.9fr_0.9fr_0.7fr_0.44fr] xl:gap-4 xl:px-6 xl:py-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Job</p>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Deadline</p>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Cliente</p>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Responsável</p>
                <p className="text-right text-xs font-semibold uppercase tracking-[0.16em] text-muted">Status</p>
                <p className="text-right text-xs font-semibold uppercase tracking-[0.16em] text-muted">Ações</p>
              </div>
              {filteredJobs.map((job, index) => (
                <div
                  key={job.id}
                  className={cn(
                    "group grid cursor-pointer gap-4 px-6 py-6 transition hover:bg-[#fafafa] focus-visible:bg-[#fafafa] xl:grid-cols-[1.15fr_1.1fr_0.9fr_0.9fr_0.7fr_0.44fr]",
                    index > 0 ? "border-t border-[#ececec]" : ""
                  )}
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
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-brand">{job.job_code ?? "Sem código"}</p>
                    <p className="text-[1.85rem] leading-none font-semibold text-text xl:text-[1.4rem]">{job.title}</p>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <CalendarDays className="h-4 w-4" />
                      <span>Criado em {new Date(job.created_at).toLocaleDateString("pt-BR")}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <DeadlineProgressRing progress={resolveDeadlineProgress(job)} />
                    <div>
                      <p className="text-sm text-muted">Deadline</p>
                      <p className="text-[1.35rem] font-semibold leading-tight text-text xl:text-base">
                        {formatDate(job.due_date)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted">Cliente</p>
                    <p className="text-[1.35rem] font-semibold leading-tight text-text xl:text-[1.22rem]">{job.clientName ?? "-"}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm text-muted">Responsável</p>
                    <p className="text-[1.35rem] font-semibold leading-tight text-text xl:text-[1.22rem]">
                      {job.assignees.length > 0 ? job.assignees.map((assignee) => assignee.name).join(", ") : "-"}
                    </p>
                  </div>

                  <div className="flex items-center justify-start xl:justify-end">{renderStatus(job.status)}</div>

                  <div className="flex items-center justify-start xl:justify-end">
                    <div className="flex items-center gap-2">
                      {profile?.role === "admin" ? (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/jobs?edit=${job.id}`);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-panel text-text transition hover:bg-panelAlt"
                            aria-label={`Editar ${job.title}`}
                          >
                            <Pencil className="h-[18px] w-[18px]" />
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void archiveJob(job);
                            }}
                            className="inline-flex h-10 w-10 items-center justify-center border border-border bg-panel text-text transition hover:bg-panelAlt"
                            aria-label={`Arquivar ${job.title}`}
                          >
                            <Archive className="h-[18px] w-[18px]" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredJobs.length > 0 ? (
            <div className="px-6 pb-6 pt-4 text-sm text-muted">
              Mostrando {filteredJobs.length} {filteredJobs.length === 1 ? "tarefa" : "tarefas"}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
