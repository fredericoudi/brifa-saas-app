"use client";

import Link from "next/link";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import { CalendarDays, GripVertical, MoveRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/loading";
import type { AgencyCommercialContext } from "@/lib/commercial";
import type { Job, JobParticipantHistory, UserProfile } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn, formatDate, JOB_STATUS_LABEL, JOB_STATUS_ORDER } from "@/lib/utils";

type JobStatus = Job["status"];

type JobWithClient = Pick<
  Job,
  "id" | "agency_id" | "client_id" | "title" | "job_code" | "status" | "created_at" | "due_date" | "due_time"
> & {
  client: { id: string; name: string } | null;
};

type CurrentAssigneeRelation = {
  user_id: string;
  user: { id: string; name: string; avatar_url: string | null; updated_at: string } | null;
  task: { job_id: string } | null;
};

type HistoricalParticipantRelation = Pick<JobParticipantHistory, "id" | "job_id" | "user_id" | "user_name"> & {
  user: { id: string; name: string; avatar_url: string | null; updated_at: string } | null;
};

type CardParticipant = {
  id: string;
  name: string;
  avatarUrl: string | null;
  updatedAt?: string;
  current: boolean;
};

type KanbanJob = JobWithClient & {
  clientName: string | null;
  currentAssignees: CardParticipant[];
  participants: CardParticipant[];
};

function sortJobsWithinColumn(a: KanbanJob, b: KanbanJob) {
  const aDue = a.due_date ? new Date(`${a.due_date}T${a.due_time?.slice(0, 5) || "23:59"}:00`).getTime() : Number.POSITIVE_INFINITY;
  const bDue = b.due_date ? new Date(`${b.due_date}T${b.due_time?.slice(0, 5) || "23:59"}:00`).getTime() : Number.POSITIVE_INFINITY;

  if (aDue !== bDue) return aDue - bDue;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

function buildStatusVariant(status: JobStatus) {
  if (status === "finalizado") return "success" as const;
  if (status === "aprovado") return "brand" as const;
  if (status === "revisao") return "warning" as const;
  return "neutral" as const;
}

function mergeParticipants({
  current,
  history
}: {
  current: CardParticipant[];
  history: CardParticipant[];
}) {
  const merged = new Map<string, CardParticipant>();

  for (const participant of current) {
    merged.set(participant.id, participant);
  }

  for (const participant of history) {
    if (!merged.has(participant.id)) {
      merged.set(participant.id, participant);
    }
  }

  return [...merged.values()];
}

export default function JobsKanbanPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [commercialContext, setCommercialContext] = useState<AgencyCommercialContext | null>(null);
  const [jobs, setJobs] = useState<KanbanJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [movingJobId, setMovingJobId] = useState<string | null>(null);

  const canMoveJobs = profile?.role === "admin" && !(commercialContext?.readOnlyMode ?? false);

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

      const commercialResponse = await fetch("/api/subscription/context", {
        method: "GET",
        cache: "no-store"
      });
      const commercialPayload = (await commercialResponse.json()) as {
        error?: string;
        context?: AgencyCommercialContext;
      };
      setCommercialContext(commercialResponse.ok ? commercialPayload.context ?? null : null);

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

      if (jobsResponse.error) throw jobsResponse.error;

      const typedJobs = ((jobsResponse.data as (JobWithClient & { archived_at?: string | null })[]) ?? []).filter(
        (job) => !job.archived_at
      );
      const jobIds = typedJobs.map((job) => job.id);

      const [{ data: assigneesData, error: assigneesError }, { data: historyData, error: historyError }] =
        await Promise.all([
          jobIds.length > 0
            ? supabase
                .from("task_assignees")
                .select("user_id, user:users(id, name, avatar_url, updated_at), task:tasks!inner(job_id)")
                .eq("agency_id", typedProfile.agency_id)
            : Promise.resolve({ data: [] as CurrentAssigneeRelation[], error: null }),
          jobIds.length > 0
            ? supabase
                .from("job_participants_history")
                .select("id, job_id, user_id, user_name, user:users(id, name, avatar_url, updated_at)")
                .eq("agency_id", typedProfile.agency_id)
                .in("job_id", jobIds)
            : Promise.resolve({ data: [] as HistoricalParticipantRelation[], error: null })
        ]);

      if (assigneesError) throw assigneesError;
      if (historyError) throw historyError;

      const currentParticipantsByJob = new Map<string, CardParticipant[]>();

      for (const relation of (assigneesData ?? []) as CurrentAssigneeRelation[]) {
        const jobId = relation.task?.job_id;
        if (!jobId) continue;

        const currentList = currentParticipantsByJob.get(jobId) ?? [];
        if (!currentList.some((participant) => participant.id === relation.user_id)) {
          currentList.push({
            id: relation.user_id,
            name: relation.user?.name ?? "Membro",
            avatarUrl: relation.user?.avatar_url ?? null,
            updatedAt: relation.user?.updated_at,
            current: true
          });
        }
        currentParticipantsByJob.set(jobId, currentList);
      }

      const historicalParticipantsByJob = new Map<string, CardParticipant[]>();
      for (const relation of (historyData ?? []) as HistoricalParticipantRelation[]) {
        const participantId =
          relation.user_id ??
          `historical-${relation.user_name
            .trim()
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")}`;
        const currentList = historicalParticipantsByJob.get(relation.job_id) ?? [];
        if (!currentList.some((participant) => participant.id === participantId)) {
          currentList.push({
            id: participantId,
            name: relation.user?.name ?? relation.user_name,
            avatarUrl: relation.user?.avatar_url ?? null,
            updatedAt: relation.user?.updated_at,
            current: false
          });
        }
        historicalParticipantsByJob.set(relation.job_id, currentList);
      }

      const parsedJobs = typedJobs.map((job) => {
        const currentAssignees = currentParticipantsByJob.get(job.id) ?? [];
        const historicalParticipants = historicalParticipantsByJob.get(job.id) ?? [];

        return {
          ...job,
          clientName: job.client?.name ?? null,
          currentAssignees,
          participants: mergeParticipants({ current: currentAssignees, history: historicalParticipants })
        } satisfies KanbanJob;
      });

      setJobs(parsedJobs);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar o Kanban de jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const visibleJobs = useMemo(() => {
    if (profile?.role === "admin") {
      return jobs;
    }

    return jobs.filter((job) => job.currentAssignees.some((participant) => participant.id === profile?.id));
  }, [jobs, profile?.id, profile?.role]);

  const columns = useMemo(
    () =>
      JOB_STATUS_ORDER.map((status) => ({
        status,
        label: JOB_STATUS_LABEL[status],
        jobs: visibleJobs.filter((job) => job.status === status).sort(sortJobsWithinColumn)
      })),
    [visibleJobs]
  );

  async function handleDragEnd(result: DropResult) {
    const destination = result.destination;

    if (!destination) return;
    if (!canMoveJobs) return;
    if (destination.droppableId === result.source.droppableId) return;

    const nextStatus = destination.droppableId as JobStatus;
    const previousJobs = jobs;

    setJobs((currentJobs) =>
      currentJobs.map((job) => (job.id === result.draggableId ? { ...job, status: nextStatus } : job))
    );
    setMovingJobId(result.draggableId);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(`/api/jobs/${result.draggableId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });

      const payload = (await response.json()) as { error?: string; description?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao mover job no Kanban.");
      }

      setSuccess(payload.description ?? "Status do job atualizado com sucesso.");
    } catch (moveError) {
      setJobs(previousJobs);
      setError(moveError instanceof Error ? moveError.message : "Falha ao mover job no Kanban.");
    } finally {
      setMovingJobId(null);
    }
  }

  if (loading) return <LoadingBlock text="Carregando Kanban de jobs..." />;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700">{success}</p> : null}

      <Card>
        <CardHeader>
          <div>
            <h2 className="text-base font-semibold">Kanban de jobs</h2>
            <p className="mt-1 text-sm text-muted">
              Visualize os jobs por etapa, com os mesmos status que o sistema já usa hoje.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge variant={canMoveJobs ? "brand" : "neutral"}>{canMoveJobs ? "Movimentação liberada" : "Modo de leitura"}</Badge>
            <span>
              {profile?.role === "admin"
                ? commercialContext?.readOnlyMode
                  ? "A assinatura está em modo de visualização, então o arraste foi bloqueado."
                  : "Arraste um card entre as colunas para atualizar o status do job e registrar a mudança na timeline."
                : "Você está vendo apenas os jobs em que participa atualmente. A movimentação fica disponível para administradores."}
            </span>
          </div>
        </CardContent>
      </Card>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {columns.map((column) => (
              <div key={column.status} className="w-[320px] flex-none">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-text">{column.label}</h3>
                        <p className="mt-1 text-xs text-muted">
                          {column.jobs.length} {column.jobs.length === 1 ? "job" : "jobs"}
                        </p>
                      </div>
                      <Badge variant={buildStatusVariant(column.status)}>{column.jobs.length}</Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="px-4 pb-4 pt-0 md:px-4">
                    <Droppable droppableId={column.status} isDropDisabled={!canMoveJobs}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "min-h-[220px] space-y-3 rounded-[22px] border border-dashed border-border/70 bg-panelAlt/30 p-2 transition",
                            snapshot.isDraggingOver ? "border-brand/40 bg-brand/5" : ""
                          )}
                        >
                          {column.jobs.length === 0 ? (
                            <div className="flex min-h-[180px] items-center justify-center rounded-[18px] border border-border/70 bg-white/70 px-4 text-center text-sm text-muted">
                              Nenhum job nesta etapa.
                            </div>
                          ) : null}

                          {column.jobs.map((job, index) => (
                            <Draggable key={job.id} draggableId={job.id} index={index} isDragDisabled={!canMoveJobs}>
                              {(dragProvided, dragSnapshot) => (
                                <div
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  className={cn(
                                    "rounded-[22px] border border-border bg-white p-4 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.4)] transition",
                                    dragSnapshot.isDragging ? "rotate-[0.6deg] shadow-panel" : ""
                                  )}
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      {job.job_code ? (
                                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                                          {job.job_code}
                                        </p>
                                      ) : null}
                                      <p className="mt-1 text-sm font-semibold text-text">{job.title}</p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Badge variant={buildStatusVariant(job.status)}>{JOB_STATUS_LABEL[job.status]}</Badge>
                                      <div
                                        {...dragProvided.dragHandleProps}
                                        className={cn(
                                          "inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-panelAlt text-muted",
                                          canMoveJobs ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                                        )}
                                        aria-label={`Mover ${job.title}`}
                                      >
                                        <GripVertical className="h-4 w-4" />
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-4 space-y-3 text-xs text-muted">
                                    <div>
                                      <p className="font-medium uppercase tracking-[0.16em] text-muted/80">Cliente</p>
                                      <p className="mt-1 text-sm text-text">{job.clientName ?? "Sem cliente"}</p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <CalendarDays className="h-4 w-4 text-brand" />
                                      <span>
                                        Entrega: {formatDate(job.due_date)}
                                        {job.due_time ? ` às ${job.due_time.slice(0, 5)}` : ""}
                                      </span>
                                    </div>

                                    <div>
                                      <p className="font-medium uppercase tracking-[0.16em] text-muted/80">Equipe</p>
                                      {job.participants.length > 0 ? (
                                        <div className="mt-2 flex items-center justify-between gap-3">
                                          <AvatarGroup
                                            users={job.participants.map((participant) => ({
                                              id: participant.id,
                                              name: participant.name,
                                              avatarUrl: participant.avatarUrl,
                                              updatedAt: participant.updatedAt
                                            }))}
                                          />
                                          <span className="truncate text-right text-xs text-muted">
                                            {job.currentAssignees.length > 0
                                              ? job.currentAssignees.map((participant) => participant.name).join(", ")
                                              : "Sem responsável ativo"}
                                          </span>
                                        </div>
                                      ) : (
                                        <p className="mt-1 text-sm text-muted">Nenhuma participação registrada ainda.</p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/70 pt-3">
                                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                                      Entrada: {new Date(job.created_at).toLocaleDateString("pt-BR")}
                                    </p>
                                    <Link
                                      href={`/jobs/${job.id}`}
                                      className="inline-flex items-center gap-1 text-sm font-medium text-brand transition hover:opacity-90"
                                    >
                                      Abrir
                                      <MoveRight className="h-4 w-4" />
                                    </Link>
                                  </div>

                                  {movingJobId === job.id ? (
                                    <p className="mt-2 text-[11px] font-medium text-brand">Atualizando status...</p>
                                  ) : null}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
