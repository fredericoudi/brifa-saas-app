"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/loading";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type AgencyCommercialContext } from "@/lib/commercial";
import type { Client, Database, Job, Task, UserProfile } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type JobWithClient = Job & { client: { name: string } | null };

type TeamMember = Pick<UserProfile, "id" | "name">;

type JobTaskForm = {
  id?: string;
  title: string;
  priority: Task["priority"];
  status: Task["status"];
  due_date: string;
  due_time: string;
  description: string;
  assignee_id: string;
};

type JobForm = {
  id?: string;
  title: string;
  client_id: string;
  client_need: string;
  description: string;
  status: Job["status"];
  start_date: string;
  start_time: string;
  due_date: string;
  due_time: string;
  tasks: JobTaskForm[];
};

type EditingSnapshot = {
  status: Job["status"];
  description: string;
  tasks: Array<{
    id: string;
    title: string;
    priority: Task["priority"];
    status: Task["status"];
    due_date: string;
    due_time: string;
    description: string;
    assignee_id: string;
  }>;
};

type TaskSyncSummary = {
  created: string[];
  edited: string[];
  removed: string[];
  statusChanged: Array<{ title: string; from: Task["status"]; to: Task["status"] }>;
  completed: string[];
  assigneesChanged: string[];
};

const EMPTY_TASK: JobTaskForm = {
  title: "",
  priority: "media",
  status: "a_fazer",
  due_date: "",
  due_time: "",
  description: "",
  assignee_id: ""
};

const INITIAL_FORM: JobForm = {
  title: "",
  client_id: "",
  client_need: "",
  description: "",
  status: "briefing",
  start_date: "",
  start_time: "",
  due_date: "",
  due_time: "",
  tasks: []
};

function resolveTaskTitle(task: Pick<JobTaskForm, "title" | "description">, index: number) {
  const existingTitle = task.title.trim();

  const firstDescriptionLine = task.description
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (existingTitle && (!existingTitle.startsWith("Tarefa ") || !firstDescriptionLine)) {
    return existingTitle;
  }

  if (firstDescriptionLine) {
    return firstDescriptionLine.slice(0, 180);
  }

  return existingTitle || `Tarefa ${index + 1}`;
}

function normalizeTimeValue(value: string | null | undefined) {
  if (!value) return "";
  return /^\d{2}:\d{2}/.test(value) ? value.slice(0, 5) : "";
}

export default function JobsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [commercialContext, setCommercialContext] = useState<AgencyCommercialContext | null>(null);
  const [jobs, setJobs] = useState<JobWithClient[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingBriefing, setGeneratingBriefing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<JobForm>(INITIAL_FORM);
  const [removedTaskIds, setRemovedTaskIds] = useState<string[]>([]);
  const [editingSnapshot, setEditingSnapshot] = useState<EditingSnapshot | null>(null);
  const [aiLimitModalOpen, setAiLimitModalOpen] = useState(false);
  const [aiLimitModalMessage, setAiLimitModalMessage] = useState("");
  const [aiLimitModalTrialActivated, setAiLimitModalTrialActivated] = useState(false);
  const [activatingTrial, setActivatingTrial] = useState(false);

  const isEditing = useMemo(() => Boolean(form.id), [form.id]);
  const isAdmin = profile?.role === "admin";
  const createJobPermission = commercialContext?.permissions.create_job ?? { allowed: true, message: null, reason: null };
  const createTaskPermission = commercialContext?.permissions.create_task ?? { allowed: true, message: null, reason: null };
  const aiBriefingPermission = commercialContext?.permissions.ai_briefing ?? { allowed: true, message: null, reason: null };
  const readOnlyMode = commercialContext?.readOnlyMode ?? false;

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

      setProfile(currentProfile);

      let jobsResponse = await supabase
        .from("jobs")
        .select("*, client:clients(name)")
        .eq("agency_id", currentProfile.agency_id)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (jobsResponse.error && isMissingJobsArchivedAtColumn(jobsResponse.error)) {
        jobsResponse = await supabase
          .from("jobs")
          .select("*, client:clients(name)")
          .eq("agency_id", currentProfile.agency_id)
          .order("created_at", { ascending: false });
      }

      const [{ data: clientsData, error: clientsError }, { data: usersData, error: usersError }] = await Promise.all([
        supabase
          .from("clients")
          .select("*")
          .eq("agency_id", currentProfile.agency_id)
          .order("name", { ascending: true }),
        supabase
          .from("users")
          .select("id, name")
          .eq("agency_id", currentProfile.agency_id)
          .order("name", { ascending: true })
      ]);

      if (jobsResponse.error) {
        setError(jobsResponse.error.message);
        return;
      }

      if (clientsError) {
        setError(clientsError.message);
        return;
      }

      if (usersError) {
        setError(usersError.message);
        return;
      }

      setJobs(
        (((jobsResponse.data as (JobWithClient & { archived_at?: string | null })[]) ?? []).filter((job) => !job.archived_at) as JobWithClient[])
      );
      setClients(clientsData ?? []);
      setUsers((usersData as TeamMember[]) ?? []);

      const commercialResponse = await fetch("/api/subscription/context", {
        method: "GET",
        cache: "no-store"
      });
      const commercialPayload = (await commercialResponse.json()) as {
        error?: string;
        context?: AgencyCommercialContext;
      };
      setCommercialContext(commercialResponse.ok ? commercialPayload.context ?? null : null);
    } catch {
      setError("Erro ao carregar jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!editId || loading || jobs.length === 0) return;
    if (!isAdmin) return;

    const targetJob = jobs.find((job) => job.id === editId);
    if (!targetJob) return;

    void handleEdit(targetJob).then(() => {
      router.replace("/jobs", { scroll: false });
    });
  }, [editId, isAdmin, jobs, loading, router]);

  async function handleEdit(job: JobWithClient) {
    if (!isAdmin) {
      setError("Somente administradores podem editar jobs.");
      return;
    }

    setError("");

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: tasksData, error: tasksError } = await supabase
        .from("tasks")
        .select("id, title, priority, status, due_date, due_time, description, task_assignees(user_id)")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true });

      if (tasksError) throw tasksError;

      const parsedTasks = ((tasksData as Array<{
        id: string;
        title: string;
        priority: Task["priority"];
        status: Task["status"];
        due_date: string | null;
        due_time: string | null;
        description: string | null;
        task_assignees?: Array<{ user_id: string }> | null;
      }>) ?? [])
        .map((task) => ({
          id: task.id,
          title: task.title,
          priority: task.priority,
          status: task.status,
          due_date: task.due_date ?? "",
          due_time: normalizeTimeValue(task.due_time),
          description: task.description ?? "",
          assignee_id: task.task_assignees?.[0]?.user_id ?? ""
        }));

      setForm({
        id: job.id,
        title: job.title,
        client_id: job.client_id,
        client_need: job.client_need ?? "",
        description: job.description ?? "",
        status: job.status,
        start_date: job.start_date ?? "",
        start_time: normalizeTimeValue(job.start_time),
        due_date: job.due_date ?? "",
        due_time: normalizeTimeValue(job.due_time),
        tasks: parsedTasks
      });

      setRemovedTaskIds([]);
      setEditingSnapshot({
        status: job.status,
        description: job.description ?? "",
        tasks: parsedTasks.map((task) => ({
          id: task.id ?? "",
          title: task.title,
          priority: task.priority,
          status: task.status,
          due_date: task.due_date,
          due_time: task.due_time,
          description: task.description,
          assignee_id: task.assignee_id
        }))
      });
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Falha ao carregar tarefas do job.");
    }
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setRemovedTaskIds([]);
    setEditingSnapshot(null);
    setGeneratingBriefing(false);
    setError("");
  }

  function addTask() {
    setForm((prev) => ({
      ...prev,
      tasks: [...prev.tasks, { ...EMPTY_TASK, title: `Tarefa ${prev.tasks.length + 1}` }]
    }));
  }

  function updateTask(taskIndex: number, updater: (task: JobTaskForm) => JobTaskForm) {
    setForm((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task, index) => (index === taskIndex ? updater(task) : task))
    }));
  }

  function removeTask(taskIndex: number) {
    setForm((prev) => {
      const task = prev.tasks[taskIndex];
      if (task?.id) {
        setRemovedTaskIds((current) => [...new Set([...current, task.id as string])]);
      }

      return {
        ...prev,
        tasks: prev.tasks.filter((_, index) => index !== taskIndex)
      };
    });
  }

  async function syncJobTasks({
    supabase,
    jobId,
    agencyId,
    tasks
  }: {
    supabase: ReturnType<typeof createBrowserSupabaseClient>;
    jobId: string;
    agencyId: string;
    tasks: JobTaskForm[];
  }): Promise<TaskSyncSummary> {
    const summary: TaskSyncSummary = {
      created: [],
      edited: [],
      removed: [],
      statusChanged: [],
      completed: [],
      assigneesChanged: []
    };

    const snapshotMap = new Map((editingSnapshot?.tasks ?? []).map((task) => [task.id, task]));

    for (const taskId of removedTaskIds) {
      await supabase.from("tasks").delete().eq("id", taskId).eq("job_id", jobId);
      const removedTitle = snapshotMap.get(taskId)?.title;
      if (removedTitle) {
        summary.removed.push(removedTitle);
      }
    }

    for (const [index, task] of tasks.entries()) {
      const resolvedTitle = resolveTaskTitle(task, index);
      const assigneeId = task.assignee_id || null;
      const payload = {
        agency_id: agencyId,
        job_id: jobId,
        title: resolvedTitle,
        priority: task.priority,
        status: task.status,
        estimated_hours: 1,
        due_date: task.due_date || null,
        due_time: task.due_time || null,
        description: task.description || null,
        assigned_to: assigneeId,
        position: (index + 1) * 1000
      };

      let resolvedTaskId = task.id;

      if (task.id) {
        const { error: updateTaskError } = await supabase.from("tasks").update(payload).eq("id", task.id).eq("job_id", jobId);
        if (updateTaskError) throw updateTaskError;
      } else {
        const { data: insertedTask, error: insertTaskError } = await supabase
          .from("tasks")
          .insert(payload)
          .select("id")
          .single();

        if (insertTaskError || !insertedTask) throw insertTaskError;
        resolvedTaskId = insertedTask.id;
        summary.created.push(payload.title);
      }

      if (!resolvedTaskId) continue;

      const previous = snapshotMap.get(resolvedTaskId);
      const previousAssignee = previous?.assignee_id ?? "";

      if (previousAssignee && previousAssignee !== (assigneeId ?? "")) {
        const { error: deleteAssigneeError } = await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", resolvedTaskId)
          .eq("user_id", previousAssignee);

        if (deleteAssigneeError) throw deleteAssigneeError;
      }

      if (assigneeId) {
        const assigneePayload = {
          agency_id: agencyId,
          task_id: resolvedTaskId,
          user_id: assigneeId
        };

        const { error: assignError } = await supabase.from("task_assignees").upsert(assigneePayload, {
          onConflict: "task_id,user_id"
        });

        if (assignError) throw assignError;
      }

      if (previous) {
        const taskEdited =
          previous.title !== payload.title ||
          previous.priority !== payload.priority ||
          previous.due_date !== (payload.due_date ?? "") ||
          previous.due_time !== (payload.due_time ?? "") ||
          previous.description !== (payload.description ?? "");

        if (taskEdited) {
          summary.edited.push(payload.title);
        }
      }

      if (previous && previous.status !== payload.status) {
        summary.statusChanged.push({ title: payload.title, from: previous.status, to: payload.status });
        if (previous.status !== "concluido" && payload.status === "concluido") {
          summary.completed.push(payload.title);
        }
      }

      if (previousAssignee !== (assigneeId ?? "")) {
        summary.assigneesChanged.push(payload.title);
      }
    }

    return summary;
  }

  async function handleGenerateBriefing() {
    const necessidadeCliente = form.client_need.trim();

    if (!necessidadeCliente) {
      setError("Preencha a necessidade do cliente antes de gerar o briefing.");
      return;
    }

    if (!aiBriefingPermission.allowed) {
      if (aiBriefingPermission.reason === "limit_reached") {
        setAiLimitModalMessage(aiBriefingPermission.message ?? "Você atingiu o limite de IA do seu plano.");
        setAiLimitModalTrialActivated(Boolean(commercialContext?.trial.activated));
        setAiLimitModalOpen(true);
        return;
      }

      setError(aiBriefingPermission.message ?? "A geração de briefing com IA está bloqueada.");
      return;
    }

    try {
      setGeneratingBriefing(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/generate-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ necessidade: necessidadeCliente })
      });

      const result = (await response.json()) as {
        error?: string;
        message?: string;
        briefing?: string;
        type?: string;
        trialActivated?: boolean;
      };

      if (!response.ok) {
        if (result.error === "LIMIT_REACHED" && result.type === "AI") {
          setAiLimitModalMessage(result.message ?? "Você atingiu o limite de IA do plano Starter.");
          setAiLimitModalTrialActivated(Boolean(result.trialActivated ?? commercialContext?.trial.activated));
          setAiLimitModalOpen(true);
          return;
        }

        throw new Error(result.message ?? result.error ?? "Falha ao gerar briefing com IA.");
      }

      if (!result.briefing) {
        throw new Error(result.message ?? result.error ?? "Falha ao gerar briefing com IA.");
      }

      setForm((prev) => ({ ...prev, description: result.briefing ?? prev.description }));
      setSuccess("Briefing gerado com IA. Revise o conteúdo antes de salvar o job.");
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : "Falha ao gerar briefing com IA.");
    } finally {
      setGeneratingBriefing(false);
    }
  }

  async function handleActivateTrial() {
    try {
      setActivatingTrial(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/subscription/trial/activate", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
            context?: AgencyCommercialContext;
          }
        | null;

      if (!response.ok) {
        if (payload?.error === "TRIAL_ALREADY_ACTIVATED") {
          setAiLimitModalTrialActivated(true);
          if (payload.context) {
            setCommercialContext(payload.context);
          }
          window.dispatchEvent(new Event("commercial-context:refresh"));
          return;
        }

        throw new Error(payload?.error ?? payload?.message ?? "Não foi possível liberar o acesso completo.");
      }

      window.dispatchEvent(new Event("commercial-context:refresh"));
      if (payload?.context) {
        setCommercialContext(payload.context);
      } else {
        await loadData();
      }

      setAiLimitModalOpen(false);
      setSuccess("Acesso completo liberado por 7 dias. Gere novamente o briefing para continuar.");
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Não foi possível liberar o acesso completo.");
    } finally {
      setActivatingTrial(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) return;
    if (!isAdmin) {
      setError("Somente administradores podem editar jobs.");
      return;
    }
    if (readOnlyMode) {
      setError(createJobPermission.message ?? "Sua assinatura está em modo de visualização. Atualizações estão bloqueadas.");
      return;
    }

    if (form.tasks.some((task) => !task.assignee_id)) {
      setError("Selecione um responsável em todas as tarefas.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const supabase = createBrowserSupabaseClient();

      const normalizedTasks = form.tasks.map((task, index) => ({
        ...task,
        title: resolveTaskTitle(task, index),
        assignee_id: task.assignee_id
      }));

      const hasNewTasks = normalizedTasks.some((task) => !task.id);

      if (!form.id && !createJobPermission.allowed) {
        setError(createJobPermission.message ?? "A criação de jobs está bloqueada para a sua assinatura.");
        return;
      }

      if (hasNewTasks && !createTaskPermission.allowed) {
        setError(createTaskPermission.message ?? "A criação de tarefas está bloqueada para a sua assinatura.");
        return;
      }

      const payload = {
        agency_id: profile.agency_id,
        client_id: form.client_id,
        title: form.title,
        client_need: form.client_need.trim() || null,
        description: form.description || null,
        status: form.status,
        start_date: form.start_date || null,
        start_time: form.start_time || null,
        due_date: form.due_date || null,
        due_time: form.due_time || null
      };

      if (form.id) {
        const { error: updateError } = await supabase.from("jobs").update(payload).eq("id", form.id);
        if (updateError) throw updateError;

        const syncSummary = await syncJobTasks({
          supabase,
          jobId: form.id,
          agencyId: profile.agency_id,
          tasks: normalizedTasks
        });

        const jobEvents: Array<Database["public"]["Tables"]["job_events"]["Insert"]> = [];

        if (editingSnapshot && editingSnapshot.status !== form.status) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "job_status_changed",
            description: `Status do job alterado de "${editingSnapshot.status}" para "${form.status}".`
          });
        }

        const previousBriefing = editingSnapshot?.description.trim() ?? "";
        const currentBriefing = form.description.trim();
        if (previousBriefing !== currentBriefing) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "briefing_updated",
            description: "Briefing atualizado."
          });
        }

        for (const taskTitle of syncSummary.created) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "task_created",
            description: `Tarefa "${taskTitle}" adicionada.`
          });
        }

        for (const statusChange of syncSummary.statusChanged) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "task_edited",
            description: `Status da tarefa "${statusChange.title}" alterado de "${statusChange.from}" para "${statusChange.to}".`
          });
        }

        for (const taskTitle of syncSummary.completed) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "task_completed",
            description: `Tarefa "${taskTitle}" concluída.`
          });
        }

        for (const taskTitle of syncSummary.edited) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "task_edited",
            description: `Tarefa "${taskTitle}" editada.`
          });
        }

        for (const taskTitle of syncSummary.removed) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "task_edited",
            description: `Tarefa "${taskTitle}" removida.`
          });
        }

        for (const taskTitle of syncSummary.assigneesChanged) {
          jobEvents.push({
            job_id: form.id,
            user_id: profile.id,
            event_type: "assignee_defined",
            description: `Responsável definido para "${taskTitle}".`
          });
        }

        if (jobEvents.length > 0) {
          const { error: eventsError } = await supabase.from("job_events").insert(jobEvents);
          if (eventsError) {
            console.error("Falha ao registrar eventos do job:", eventsError.message);
          }
        }

        setSuccess("Job atualizado com sucesso.");
      } else {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: form.client_id,
            title: form.title,
            client_need: form.client_need.trim() || null,
            description: form.description || null,
            status: form.status,
            start_date: form.start_date || null,
            start_time: form.start_time || null,
            due_date: form.due_date || null,
            due_time: form.due_time || null,
            tasks: normalizedTasks.map((task) => ({
              title: task.title,
              priority: task.priority,
              status: task.status,
              due_date: task.due_date || null,
              due_time: task.due_time || null,
              description: task.description || null,
              assignee_ids: task.assignee_id ? [task.assignee_id] : []
            }))
          })
        });

        const result = (await response.json()) as { error?: string; warning?: string; jobCode?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Falha ao criar job.");
        }

        if (result.warning) {
          setSuccess(result.warning);
        } else if (result.jobCode) {
          setSuccess(`Job criado com sucesso (${result.jobCode}).`);
        } else {
          setSuccess("Job criado com sucesso.");
        }
      }

      resetForm();
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar job.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock text="Carregando jobs..." />;

  return (
    <div className="space-y-6">
      {!isAdmin ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Jobs</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted">
              Somente administradores podem criar ou editar jobs. Para acompanhar o que precisa executar, use a tela
              de tarefas.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {isAdmin ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">{isEditing ? "Editar job" : "Novo job"}</h2>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Título</label>
              <Input value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Cliente</label>
              <Select
                value={form.client_id}
                onChange={(e) => setForm((prev) => ({ ...prev, client_id: e.target.value }))}
                required
              >
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="md:col-span-2 grid gap-3 md:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Status</label>
                <Select
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as Job["status"] }))}
                  required
                >
                  <option value="briefing">Briefing</option>
                  <option value="criacao">Criação</option>
                  <option value="revisao">Revisão</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="finalizado">Finalizado</option>
                </Select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Data de Início</label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Hora de Início</label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, start_time: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Data de Entrega</label>
                <Input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((prev) => ({ ...prev, due_date: e.target.value }))}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Hora de Entrega</label>
                <Input
                  type="time"
                  value={form.due_time}
                  onChange={(e) => setForm((prev) => ({ ...prev, due_time: e.target.value }))}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Necessidade do cliente</label>
              <Textarea
                value={form.client_need}
                onChange={(e) => setForm((prev) => ({ ...prev, client_need: e.target.value }))}
                placeholder="Descreva em texto livre o que o cliente solicitou."
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleGenerateBriefing}
                  disabled={generatingBriefing || saving || !aiBriefingPermission.allowed}
                >
                  {generatingBriefing ? "Gerando briefing..." : "Gerar briefing com IA"}
                </Button>
                {generatingBriefing ? <p className="text-xs text-muted">Gerando briefing...</p> : null}
                {!aiBriefingPermission.allowed ? (
                  <p className="text-xs text-amber-700">{aiBriefingPermission.message}</p>
                ) : null}
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Briefing</label>
              <Textarea
                className="min-h-[400px]"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder="O briefing gerado com IA aparecerá aqui. Você pode editar antes de salvar."
              />
            </div>

            <div className="md:col-span-2 rounded-xl border border-border p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Tarefas do Job</h3>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addTask}
                  disabled={!createTaskPermission.allowed}
                >
                  Adicionar tarefa
                </Button>
              </div>
              {!createTaskPermission.allowed ? (
                <p className="mb-3 text-xs text-amber-700">{createTaskPermission.message}</p>
              ) : null}

              {form.tasks.length === 0 ? (
                <p className="text-sm text-muted">Nenhuma tarefa adicionada neste job.</p>
              ) : (
                <div className="space-y-4">
                  {form.tasks.map((task, index) => (
                    <div key={task.id ?? `new-${index}`} className="rounded-xl border border-border/70 bg-panelAlt p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Tarefa {index + 1}</p>
                        <Button type="button" variant="danger" size="sm" onClick={() => removeTask(index)}>
                          Remover
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                        <div className="lg:col-span-2">
                          <label className="mb-1 block text-xs font-medium text-muted">Responsável</label>
                          <Select
                            value={task.assignee_id}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, assignee_id: e.target.value }))}
                            required
                          >
                            <option value="">Selecione um responsável</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted">Prioridade</label>
                          <Select
                            value={task.priority}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, priority: e.target.value as Task["priority"] }))}
                          >
                            <option value="baixa">Baixa</option>
                            <option value="media">Média</option>
                            <option value="alta">Alta</option>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted">Status</label>
                          <Select
                            value={task.status}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, status: e.target.value as Task["status"] }))}
                          >
                            <option value="a_fazer">A fazer</option>
                            <option value="em_andamento">Em andamento</option>
                            <option value="revisao">Revisão</option>
                            <option value="concluido">Concluído</option>
                          </Select>
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted">Prazo (Data)</label>
                          <Input
                            type="date"
                            value={task.due_date}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, due_date: e.target.value }))}
                          />
                        </div>

                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted">Prazo (Hora)</label>
                          <Input
                            type="time"
                            value={task.due_time}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, due_time: e.target.value }))}
                          />
                        </div>

                        <div className="md:col-span-2 lg:col-span-4">
                          <label className="mb-1 block text-xs font-medium text-muted">Descrição</label>
                          <Textarea
                            value={task.description}
                            onChange={(e) => updateTask(index, (current) => ({ ...current, description: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {error ? <p className="md:col-span-2 rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
            {success ? <p className="md:col-span-2 rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}

            <div className="md:col-span-2 flex gap-2">
              <Button
                type="submit"
                disabled={saving || generatingBriefing || readOnlyMode || (!isEditing && !createJobPermission.allowed)}
              >
                {saving ? "Salvando..." : isEditing ? "Atualizar job" : "Criar job"}
              </Button>
              {isEditing ? (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {aiLimitModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <h3 className="text-lg font-semibold text-text">🚀 Sua agência está crescendo!</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiLimitModalTrialActivated ? (
                <>
                  <p className="text-sm text-text">{aiLimitModalMessage || "Você atingiu o limite de IA do seu plano."}</p>
                  <p className="text-sm text-muted">Desbloqueie IA ilimitada para continuar criando sem travar sua operação.</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text">Você atingiu o limite de IA do plano Starter.</p>
                  <p className="text-sm text-muted">
                    Libere acesso completo por 7 dias e continue criando sem limites.
                  </p>
                </>
              )}

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => {
                    if (aiLimitModalTrialActivated) {
                      setAiLimitModalOpen(false);
                      router.push("/settings#assinatura");
                      return;
                    }

                    void handleActivateTrial();
                  }}
                  disabled={activatingTrial}
                >
                  {aiLimitModalTrialActivated
                    ? "Desbloquear IA ilimitada"
                    : activatingTrial
                      ? "Liberando acesso..."
                      : "Liberar acesso completo por 7 dias"}
                </Button>
                {!aiLimitModalTrialActivated ? (
                  <Button
                    variant="secondary"
                    onClick={() => setAiLimitModalOpen(false)}
                    disabled={activatingTrial}
                  >
                    Continuar no plano gratuito
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

    </div>
  );
}
