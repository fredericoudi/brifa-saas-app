import Link from "next/link";
import { notFound } from "next/navigation";
import { JobExitBar } from "@/components/jobs/job-exit-bar";
import { JobViewTracker } from "@/components/jobs/job-view-tracker";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { requireAuth } from "@/lib/auth";
import type { Job, JobParticipantHistory } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatDate, JOB_STATUS_LABEL, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/utils";

type JobTask = {
  id: string;
  title: string;
  priority: "baixa" | "media" | "alta";
  status: "a_fazer" | "em_andamento" | "revisao" | "concluido";
  due_date: string | null;
  due_time: string | null;
  description: string | null;
};

type TimelineEvent = {
  id: string;
  event_type: string;
  description: string;
  created_at: string;
  user: { name: string; avatar_url: string | null; updated_at: string } | null;
};

type TaskAssigneeRelation = {
  task_id: string;
  user_id: string;
  user: { name: string; avatar_url: string | null; updated_at: string } | null;
};

type ParticipantHistoryEntry = Pick<
  JobParticipantHistory,
  | "id"
  | "user_name"
  | "task_title"
  | "assigned_at"
  | "started_at"
  | "ended_at"
  | "start_job_status"
  | "latest_job_status"
  | "start_task_status"
  | "latest_task_status"
  | "end_reason"
  | "is_active"
> & {
  user: { name: string; avatar_url: string | null; updated_at: string } | null;
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  job_created: "Job criado",
  assignee_defined: "Responsável definido",
  task_created: "Tarefa criada",
  task_edited: "Tarefa editada",
  task_completed: "Tarefa concluída",
  job_status_changed: "Status do job alterado",
  job_archived: "Job arquivado",
  job_participation_finished: "Saída registrada",
  briefing_updated: "Briefing atualizado",
  file_attached: "Arquivo anexado"
};

function formatEventType(eventType: string) {
  return EVENT_TYPE_LABEL[eventType] ?? "Evento";
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";

  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatParticipationEndReason(reason: ParticipantHistoryEntry["end_reason"], isActive: boolean) {
  if (isActive) return "Participação em andamento";
  if (reason === "completed") return "Tarefa concluída";
  if (reason === "removed") return "Participação encerrada";
  if (reason === "finished_job") return "Encerrada com a finalização do job";
  return "Histórico registrado";
}

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, client:clients(name, company)")
    .eq("id", params.id)
    .eq("agency_id", profile.agency_id)
    .maybeSingle();

  if (error || !job) {
    notFound();
  }

  const typedJob = job as Job & { client: { name: string | null; company: string | null } | null };

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, priority, status, due_date, due_time, description")
    .eq("job_id", typedJob.id)
    .order("created_at", { ascending: false });

  const typedTasks = ((tasks as JobTask[] | null) ?? []);
  const taskIds = typedTasks.map((task) => task.id);

  const [{ data: taskAssignees }, { data: timelineEvents }, { data: participantHistory }] = await Promise.all([
    taskIds.length > 0
      ? supabase
          .from("task_assignees")
          .select("task_id, user_id, user:users(name, avatar_url, updated_at)")
          .eq("agency_id", profile.agency_id)
          .in("task_id", taskIds)
      : Promise.resolve({ data: [] as TaskAssigneeRelation[] }),
    supabase
      .from("job_events")
      .select("id, event_type, description, created_at, user:users(name, avatar_url, updated_at)")
      .eq("job_id", typedJob.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("job_participants_history")
      .select(
        "id, user_name, task_title, assigned_at, started_at, ended_at, start_job_status, latest_job_status, start_task_status, latest_task_status, end_reason, is_active, user:users(name, avatar_url, updated_at)"
      )
      .eq("agency_id", profile.agency_id)
      .eq("job_id", typedJob.id)
      .order("assigned_at", { ascending: false })
  ]);

  const assigneesByTask = new Map<string, string[]>();
  const jobAssigneeProfilesMap = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; updatedAt?: string }
  >();
  for (const assignee of (taskAssignees ?? []) as TaskAssigneeRelation[]) {
    const current = assigneesByTask.get(assignee.task_id) ?? [];
    if (assignee.user?.name) {
      current.push(assignee.user.name);
    }
    assigneesByTask.set(assignee.task_id, current);

    if (assignee.user?.name && !jobAssigneeProfilesMap.has(assignee.user_id)) {
      jobAssigneeProfilesMap.set(assignee.user_id, {
        id: assignee.user_id,
        name: assignee.user.name,
        avatarUrl: assignee.user.avatar_url ?? null,
        updatedAt: assignee.user.updated_at
      });
    }
  }

  const currentUserIsAssignee = ((taskAssignees ?? []) as TaskAssigneeRelation[]).some(
    (assignee) => assignee.user_id === profile.id
  );

  const jobAssignees = [...new Set([...assigneesByTask.values()].flat())];
  const jobAssigneeProfiles = [...jobAssigneeProfilesMap.values()];
  const assignedTaskIds = new Set(
    ((taskAssignees ?? []) as TaskAssigneeRelation[])
      .filter((assignee) => assignee.user_id === profile.id)
      .map((assignee) => assignee.task_id)
  );
  const currentUserTasks = typedTasks.filter((task) => assignedTaskIds.has(task.id));
  const allTasks = typedTasks;

  return (
    <div className="space-y-6 pb-28">
      <JobViewTracker
        jobId={typedJob.id}
        agencyId={profile.agency_id}
        userId={profile.id}
        enabled={currentUserIsAssignee}
      />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{typedJob.title}</h2>
              <p className="mt-1 text-sm text-muted">Cliente: {typedJob.client?.name ?? "-"}</p>
              {typedJob.job_code ? <p className="mt-1 text-xs text-muted">Código: {typedJob.job_code}</p> : null}
            </div>
            <Badge variant={typedJob.status === "finalizado" ? "success" : "brand"}>{JOB_STATUS_LABEL[typedJob.status]}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Cliente</p>
              <p className="mt-1 text-sm font-medium">{typedJob.client?.name ?? "-"}</p>
              <p className="mt-1 text-xs text-muted">{typedJob.client?.company ?? ""}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Status</p>
              <p className="mt-1 text-sm font-medium">{JOB_STATUS_LABEL[typedJob.status]}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Data de início</p>
              <p className="mt-1 text-sm font-medium">
                {formatDate(typedJob.start_date)}
                {typedJob.start_time ? ` às ${typedJob.start_time.slice(0, 5)}` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Data de entrega</p>
              <p className="mt-1 text-sm font-medium">
                {formatDate(typedJob.due_date)}
                {typedJob.due_time ? ` às ${typedJob.due_time.slice(0, 5)}` : ""}
              </p>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs uppercase tracking-wide text-muted">Briefing</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{typedJob.description || "Sem briefing."}</p>
          </div>

          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-muted">Responsáveis</p>
            {jobAssigneeProfiles.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <AvatarGroup users={jobAssigneeProfiles} />
                <p className="text-sm text-muted">{jobAssignees.join(", ")}</p>
              </div>
            ) : (
              <p className="mt-1 text-sm text-muted">Nenhum responsável definido ainda.</p>
            )}
          </div>

          {typedJob.drive_folder_url ? (
            <div className="mt-6">
              <a
                href={typedJob.drive_folder_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-95"
              >
                Abrir pasta no Google Drive
              </a>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {profile.role !== "admin" ? (
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold">Modo de leitura</h3>
            <p className="mt-1 text-sm text-muted">
              Você pode consultar o briefing e acompanhar suas entregas neste job, mas somente administradores podem
              editar conteúdo, prazo ou responsáveis.
            </p>
          </CardHeader>
        </Card>
      ) : null}

      {profile.role !== "admin" ? (
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold">
              {currentUserTasks.length === 1 ? "Sua tarefa neste job" : "Suas tarefas neste job"}
            </h3>
            <p className="mt-1 text-sm text-muted">Use este bloco como guia do que precisa ser executado neste job.</p>
          </CardHeader>
          <CardContent>
            {currentUserTasks.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma tarefa foi atribuída a você neste job.</p>
            ) : (
              <div className="space-y-3">
                {currentUserTasks.map((task) => (
                  <div key={task.id} className="rounded-xl border border-brand/20 bg-brand/5 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-base font-semibold">{task.title}</p>
                      <Badge variant={task.status === "concluido" ? "success" : "brand"}>
                        {TASK_STATUS_LABEL[task.status]}
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">
                      <span>Prioridade: {TASK_PRIORITY_LABEL[task.priority]}</span>
                      <span>
                        Prazo: {formatDate(task.due_date)}
                        {task.due_time ? ` às ${task.due_time.slice(0, 5)}` : ""}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm text-muted">
                      {task.description || "Sem descrição complementar para esta tarefa."}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {profile.role === "admin" ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Tarefas do Job</h3>
              <Link href="/tasks" className="text-sm text-brand hover:opacity-90">
                Ir para visão geral
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {allTasks.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma tarefa vinculada a este job.</p>
            ) : (
              <div className="space-y-3">
                {allTasks.map((task) => {
                  const assignees = assigneesByTask.get(task.id) ?? [];
                  return (
                    <div key={task.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">{task.title}</p>
                        <Badge variant={task.status === "concluido" ? "success" : "neutral"}>
                          {TASK_STATUS_LABEL[task.status]}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                        <span>Prioridade: {TASK_PRIORITY_LABEL[task.priority]}</span>
                        <span>
                          Responsáveis: {assignees.length > 0 ? assignees.join(", ") : "Não atribuídos"}
                        </span>
                        <span>
                          Prazo: {formatDate(task.due_date)}
                          {task.due_time ? ` às ${task.due_time.slice(0, 5)}` : ""}
                        </span>
                      </div>
                      {task.description ? <p className="mt-2 text-sm text-muted">{task.description}</p> : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold">Participação permanente</h3>
          <p className="mt-1 text-sm text-muted">
            Este registro permanece no job mesmo depois da conclusão da tarefa ou da finalização do projeto.
          </p>
        </CardHeader>
        <CardContent>
          {!participantHistory || participantHistory.length === 0 ? (
            <p className="text-sm text-muted">Ainda não existe histórico permanente de participação neste job.</p>
          ) : (
            <div className="space-y-3">
              {(participantHistory as ParticipantHistoryEntry[]).map((entry) => {
                const participantName = entry.user?.name ?? entry.user_name;
                const finalJobStatus = entry.latest_job_status ?? entry.start_job_status;
                const finalTaskStatus = entry.latest_task_status ?? entry.start_task_status;

                return (
                  <div key={entry.id} className="rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <UserAvatar
                          name={participantName}
                          avatarUrl={entry.user?.avatar_url ?? null}
                          updatedAt={entry.user?.updated_at}
                          className="h-11 w-11 bg-panel text-sm"
                          fallbackClassName="text-sm"
                        />
                        <div>
                          <p className="text-sm font-semibold text-text">{participantName}</p>
                          <p className="mt-1 text-sm text-muted">
                            {entry.task_title ? `Tarefa: ${entry.task_title}` : "Participação vinculada ao job"}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge variant={entry.is_active ? "brand" : "neutral"}>
                              {formatParticipationEndReason(entry.end_reason, entry.is_active)}
                            </Badge>
                            <Badge variant={finalJobStatus === "finalizado" ? "success" : "neutral"}>
                              {JOB_STATUS_LABEL[finalJobStatus]}
                            </Badge>
                            {finalTaskStatus ? <Badge variant="neutral">{TASK_STATUS_LABEL[finalTaskStatus]}</Badge> : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs text-muted md:min-w-[270px]">
                        <p>Entrada: {formatDateTime(entry.assigned_at)}</p>
                        <p>Início: {formatDateTime(entry.started_at)}</p>
                        <p>Saída: {formatDateTime(entry.ended_at)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {profile.role === "admin" ? (
        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold">Histórico do Job</h3>
          </CardHeader>
          <CardContent>
            {!timelineEvents || timelineEvents.length === 0 ? (
              <p className="text-sm text-muted">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <div className="relative space-y-4 before:absolute before:bottom-0 before:left-[7px] before:top-1 before:w-px before:bg-border">
                  {(timelineEvents as TimelineEvent[]).map((event) => {
                    return (
                      <div key={event.id} className="relative pl-8">
                        <span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-panel bg-brand" />
                        <div className="rounded-xl border border-border p-3">
                          <p className="text-xs text-muted">{new Date(event.created_at).toLocaleString("pt-BR")}</p>
                          <div className="mt-2 flex items-start gap-3">
                            <UserAvatar
                              name={event.user?.name ?? "Sistema"}
                              avatarUrl={event.user?.avatar_url ?? null}
                              updatedAt={event.user?.updated_at}
                              className="h-9 w-9 bg-panel text-[10px]"
                              fallbackClassName="text-[10px]"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{formatEventType(event.event_type)}</p>
                              <p className="mt-1 text-sm text-muted">{event.description}</p>
                              <p className="mt-1 text-xs text-muted">por {event.user?.name ?? "Sistema"}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {profile.role !== "admin" && currentUserTasks.length > 0 ? <JobExitBar jobId={typedJob.id} jobTitle={typedJob.title} /> : null}
    </div>
  );
}
