"use client";

import { File, FileDown, Trash2, Video, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { createTaskChecklistItem, getTaskChecklistProgress, normalizeTaskChecklistItems, type TaskChecklistItem } from "@/lib/task-checklist";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

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
  checklist_items: TaskChecklistItem[];
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
    checklist_items: TaskChecklistItem[];
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

type JobMediaFile = Database["public"]["Tables"]["job_media_files"]["Row"];

type JobMediaListItem = JobMediaFile & {
  previewUrl: string | null;
  isImage: boolean;
  isVideo: boolean;
};

type PendingJobMediaListItem = {
  localId: string;
  file: File;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  previewUrl: string | null;
  isImage: boolean;
  isVideo: boolean;
};

type CreatedJobSummary = {
  title: string;
  message: string;
};

const EMPTY_TASK: JobTaskForm = {
  title: "",
  priority: "media",
  status: "a_fazer",
  due_date: "",
  due_time: "",
  description: "",
  assignee_id: "",
  checklist_items: []
};

const JOB_ATTACHMENTS_BUCKET = "job-attachments";
const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

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

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "-";

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

function formatMediaAddedAt(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function formatAttachmentUploadSuccess(uploadedCount: number) {
  return uploadedCount === 1 ? "1 arquivo anexado com sucesso." : `${uploadedCount} arquivos anexados com sucesso.`;
}

function mapPendingMediaFile(file: File): PendingJobMediaListItem {
  const mimeType = file.type || null;
  const isImage = Boolean(mimeType?.startsWith("image/"));
  const isVideo = Boolean(mimeType?.startsWith("video/"));

  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    file_name: file.name,
    mime_type: mimeType,
    size_bytes: file.size,
    created_at: new Date().toISOString(),
    previewUrl: isImage ? URL.createObjectURL(file) : null,
    isImage,
    isVideo
  };
}

function isMissingJobMediaTable(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("job_media_files") &&
    (normalized.includes("could not find the table") || normalized.includes("relation") || normalized.includes("schema cache"))
  );
}

function isMissingTaskChecklistItemsColumn(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("checklist_items") && normalized.includes("tasks") && normalized.includes("schema cache");
}

function extractMissingTaskColumn(errorMessage: string) {
  const match = errorMessage.match(/Could not find the '([^']+)' column of 'tasks' in the schema cache/i);
  return match?.[1] ?? null;
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
  const [jobMediaFiles, setJobMediaFiles] = useState<JobMediaListItem[]>([]);
  const [pendingJobMediaFiles, setPendingJobMediaFiles] = useState<PendingJobMediaListItem[]>([]);
  const [createdJobSummary, setCreatedJobSummary] = useState<CreatedJobSummary | null>(null);
  const [loadingJobMedia, setLoadingJobMedia] = useState(false);
  const [uploadingJobMedia, setUploadingJobMedia] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [taskChecklistDrafts, setTaskChecklistDrafts] = useState<Record<string, string>>({});
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const isEditing = useMemo(() => Boolean(form.id), [form.id]);
  const isAdmin = profile?.role === "admin";
  const createJobPermission = commercialContext?.permissions.create_job ?? { allowed: true, message: null, reason: null };
  const createTaskPermission = commercialContext?.permissions.create_task ?? { allowed: true, message: null, reason: null };
  const aiBriefingPermission = commercialContext?.permissions.ai_briefing ?? { allowed: true, message: null, reason: null };
  const readOnlyMode = commercialContext?.readOnlyMode ?? false;

  function clearPendingJobMediaFiles() {
    setPendingJobMediaFiles((current) => {
      current.forEach((file) => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
      return [];
    });
  }

  function removePendingJobMedia(localId: string) {
    setPendingJobMediaFiles((current) =>
      current.filter((file) => {
        if (file.localId === localId && file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
        return file.localId !== localId;
      })
    );
  }

  async function loadJobMedia(jobId: string) {
    if (!profile) {
      setJobMediaFiles([]);
      return;
    }

    try {
      setLoadingJobMedia(true);
      const supabase = createBrowserSupabaseClient();
      const { data, error: mediaError } = await supabase
        .from("job_media_files")
        .select("*")
        .eq("agency_id", profile.agency_id)
        .eq("job_id", jobId)
        .order("created_at", { ascending: false });

      if (mediaError) {
        throw mediaError;
      }

      const typedMedia = (data ?? []) as JobMediaFile[];

      const withPreview = await Promise.all(
        typedMedia.map(async (file) => {
          const isImage = Boolean(file.mime_type?.startsWith("image/"));
          const isVideo = Boolean(file.mime_type?.startsWith("video/"));

          if (!isImage) {
            return {
              ...file,
              isImage,
              isVideo,
              previewUrl: null
            } satisfies JobMediaListItem;
          }

          const { data: previewData } = await supabase.storage
            .from(JOB_ATTACHMENTS_BUCKET)
            .createSignedUrl(file.storage_path, 60 * 60);

          return {
            ...file,
            isImage,
            isVideo,
            previewUrl: previewData?.signedUrl ?? null
          } satisfies JobMediaListItem;
        })
      );

      setJobMediaFiles(withPreview);
    } catch (mediaError) {
      if (mediaError instanceof Error && isMissingJobMediaTable(mediaError.message)) {
        setJobMediaFiles([]);
        return;
      }

      setJobMediaFiles([]);
      setError("Não foi possível carregar os anexos deste job.");
    } finally {
      setLoadingJobMedia(false);
    }
  }

  async function openMediaDownload(file: JobMediaListItem) {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data, error: signedUrlError } = await supabase.storage
        .from(JOB_ATTACHMENTS_BUCKET)
        .createSignedUrl(file.storage_path, 60 * 5, {
          download: file.file_name
        });

      if (signedUrlError || !data?.signedUrl) {
        throw signedUrlError ?? new Error("Não foi possível gerar o link de download.");
      }

      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Falha ao baixar o arquivo.");
    }
  }

  async function handleDeleteMedia(file: JobMediaListItem) {
    if (!profile || !form.id || !isAdmin) return;

    const confirmed = window.confirm(`Deseja remover o arquivo "${file.file_name}"?`);
    if (!confirmed) return;

    try {
      setDeletingMediaId(file.id);
      setError("");
      setSuccess("");
      const supabase = createBrowserSupabaseClient();

      const { error: storageError } = await supabase.storage.from(JOB_ATTACHMENTS_BUCKET).remove([file.storage_path]);
      if (storageError) throw storageError;

      const { error: deleteError } = await supabase
        .from("job_media_files")
        .delete()
        .eq("id", file.id)
        .eq("job_id", form.id)
        .eq("agency_id", profile.agency_id);
      if (deleteError) throw deleteError;

      const { error: eventError } = await supabase.from("job_events").insert({
        job_id: form.id,
        user_id: profile.id,
        event_type: "file_deleted",
        description: `Arquivo removido: "${file.file_name}".`
      });

      if (eventError) {
        console.error("Falha ao registrar remoção de arquivo:", eventError.message);
      }

      setSuccess("Arquivo removido com sucesso.");
      await loadJobMedia(form.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao remover o arquivo.");
    } finally {
      setDeletingMediaId(null);
    }
  }

  async function uploadMediaFilesToJob({
    files,
    jobId
  }: {
    files: File[];
    jobId: string;
  }) {
    if (!profile) {
      throw new Error("Sessão expirada.");
    }

    const supabase = createBrowserSupabaseClient();
    let uploadedCount = 0;

    for (const file of files) {
      if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        throw new Error(`O arquivo "${file.name}" excede o limite de 50 MB.`);
      }

      const safeName = sanitizeFileName(file.name) || `arquivo-${Date.now()}`;
      const storagePath = `${profile.agency_id}/jobs/${jobId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from(JOB_ATTACHMENTS_BUCKET).upload(storagePath, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || undefined
      });

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("job_media_files").insert({
        agency_id: profile.agency_id,
        job_id: jobId,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: file.type || null,
        size_bytes: file.size,
        created_by: profile.id
      });

      if (insertError) {
        await supabase.storage.from(JOB_ATTACHMENTS_BUCKET).remove([storagePath]);
        throw insertError;
      }

      const { error: eventError } = await supabase.from("job_events").insert({
        job_id: jobId,
        user_id: profile.id,
        event_type: "file_attached",
        description: `Arquivo anexado: "${file.name}".`
      });

      if (eventError) {
        console.error("Falha ao registrar anexo de arquivo:", eventError.message);
      }

      uploadedCount += 1;
    }

    return uploadedCount;
  }

  async function handleMediaInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!profile || !isAdmin || readOnlyMode) return;

    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    try {
      setUploadingJobMedia(true);
      setError("");
      setSuccess("");

      if (form.id) {
        const uploadedCount = await uploadMediaFilesToJob({
          files: selectedFiles,
          jobId: form.id
        });

        setSuccess(formatAttachmentUploadSuccess(uploadedCount));
        await loadJobMedia(form.id);
      } else {
        for (const file of selectedFiles) {
          if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            throw new Error(`O arquivo "${file.name}" excede o limite de 50 MB.`);
          }
        }

        const pendingFiles = selectedFiles.map(mapPendingMediaFile);
        setPendingJobMediaFiles((current) => [...pendingFiles, ...current]);
        setSuccess(
          selectedFiles.length === 1
            ? "Arquivo adicionado. O envio será concluído ao salvar o job."
            : `${selectedFiles.length} arquivos adicionados. O envio será concluído ao salvar o job.`
        );
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao anexar arquivos.");
    } finally {
      setUploadingJobMedia(false);
      if (mediaInputRef.current) {
        mediaInputRef.current.value = "";
      }
    }
  }

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
    setCreatedJobSummary(null);
    clearPendingJobMediaFiles();

    try {
      const supabase = createBrowserSupabaseClient();
      let tasksResponse = await supabase
        .from("tasks")
        .select("id, title, priority, status, due_date, due_time, description, checklist_items, task_assignees(user_id)")
        .eq("job_id", job.id)
        .order("created_at", { ascending: true });

      if (tasksResponse.error && isMissingTaskChecklistItemsColumn(tasksResponse.error.message)) {
        tasksResponse = await supabase
          .from("tasks")
          .select("id, title, priority, status, due_date, due_time, description, task_assignees(user_id)")
          .eq("job_id", job.id)
          .order("created_at", { ascending: true });
      }

      if (tasksResponse.error) throw tasksResponse.error;

      const parsedTasks = ((tasksResponse.data as Array<{
        id: string;
        title: string;
        priority: Task["priority"];
        status: Task["status"];
        due_date: string | null;
        due_time: string | null;
        description: string | null;
        checklist_items?: unknown;
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
          assignee_id: task.task_assignees?.[0]?.user_id ?? "",
          checklist_items: normalizeTaskChecklistItems(task.checklist_items)
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
      setTaskChecklistDrafts({});

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
          assignee_id: task.assignee_id,
          checklist_items: task.checklist_items
        }))
      });

      await loadJobMedia(job.id);
    } catch (editError) {
      setError(editError instanceof Error ? editError.message : "Falha ao carregar tarefas do job.");
    }
  }

  function resetForm(options?: { preserveCreatedSummary?: boolean }) {
    setForm(INITIAL_FORM);
    setRemovedTaskIds([]);
    setEditingSnapshot(null);
    setJobMediaFiles([]);
    clearPendingJobMediaFiles();
    setTaskChecklistDrafts({});
    setGeneratingBriefing(false);
    setError("");
    if (!options?.preserveCreatedSummary) {
      setCreatedJobSummary(null);
    }
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
    const taskToRemove = form.tasks[taskIndex];
    if (taskToRemove) {
      const draftKey = getTaskChecklistDraftKey(taskToRemove, taskIndex);
      setTaskChecklistDrafts((prev) => {
        if (!(draftKey in prev)) return prev;
        const next = { ...prev };
        delete next[draftKey];
        return next;
      });
    }

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

  function getTaskChecklistDraftKey(task: JobTaskForm, index: number) {
    return task.id ?? `new-${index}`;
  }

  function setChecklistDraft(task: JobTaskForm, index: number, value: string) {
    const key = getTaskChecklistDraftKey(task, index);
    setTaskChecklistDrafts((prev) => ({
      ...prev,
      [key]: value
    }));
  }

  function addChecklistItem(taskIndex: number) {
    const task = form.tasks[taskIndex];
    if (!task) return;

    const key = getTaskChecklistDraftKey(task, taskIndex);
    const text = (taskChecklistDrafts[key] ?? "").trim();
    if (!text) return;

    updateTask(taskIndex, (current) => ({
      ...current,
      checklist_items: [...current.checklist_items, createTaskChecklistItem(text)]
    }));

    setTaskChecklistDrafts((prev) => ({
      ...prev,
      [key]: ""
    }));
  }

  function toggleChecklistItem(taskIndex: number, itemId: string, done: boolean) {
    updateTask(taskIndex, (current) => ({
      ...current,
      checklist_items: current.checklist_items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              done,
              completed_at: done ? new Date().toISOString() : null
            }
          : item
      )
    }));
  }

  function removeChecklistItem(taskIndex: number, itemId: string) {
    updateTask(taskIndex, (current) => ({
      ...current,
      checklist_items: current.checklist_items.filter((item) => item.id !== itemId)
    }));
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
      const payload: Record<string, unknown> = {
        agency_id: agencyId,
        job_id: jobId,
        title: resolvedTitle,
        priority: task.priority,
        status: task.status,
        estimated_hours: 1,
        due_date: task.due_date || null,
        due_time: task.due_time || null,
        description: task.description || null,
        checklist_items: task.checklist_items,
        assigned_to: assigneeId,
        position: (index + 1) * 1000
      };

      let resolvedTaskId = task.id;

      if (task.id) {
        const compatiblePayload = { ...payload };

        while (true) {
          const { error: updateTaskError } = await supabase
            .from("tasks")
            .update(compatiblePayload)
            .eq("id", task.id)
            .eq("job_id", jobId);

          if (!updateTaskError) break;

          const missingColumn = extractMissingTaskColumn(updateTaskError.message);
          if (missingColumn && missingColumn in compatiblePayload) {
            delete compatiblePayload[missingColumn];
            continue;
          }

          throw updateTaskError;
        }
      } else {
        const compatiblePayload = { ...payload };
        let insertedTaskId: string | null = null;

        while (true) {
          const { data: insertedTask, error: insertTaskError } = await supabase
            .from("tasks")
            .insert(compatiblePayload)
            .select("id")
            .single();

          if (!insertTaskError && insertedTask) {
            insertedTaskId = insertedTask.id;
            break;
          }

          const missingColumn = insertTaskError ? extractMissingTaskColumn(insertTaskError.message) : null;
          if (missingColumn && missingColumn in compatiblePayload) {
            delete compatiblePayload[missingColumn];
            continue;
          }

          throw insertTaskError ?? new Error("Falha ao inserir tarefa.");
        }

        resolvedTaskId = insertedTaskId;
        summary.created.push(resolvedTitle);
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
          previous.title !== resolvedTitle ||
          previous.priority !== task.priority ||
          previous.due_date !== (task.due_date || "") ||
          previous.due_time !== (task.due_time || "") ||
          previous.description !== (task.description || "") ||
          JSON.stringify(previous.checklist_items) !== JSON.stringify(task.checklist_items);

        if (taskEdited) {
          summary.edited.push(resolvedTitle);
        }
      }

      if (previous && previous.status !== task.status) {
        summary.statusChanged.push({ title: resolvedTitle, from: previous.status, to: task.status });
        if (previous.status !== "concluido" && task.status === "concluido") {
          summary.completed.push(resolvedTitle);
        }
      }

      if (previousAssignee !== (assigneeId ?? "")) {
        summary.assigneesChanged.push(resolvedTitle);
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
      setCreatedJobSummary(null);

      const supabase = createBrowserSupabaseClient();
      const pendingFilesToUpload = pendingJobMediaFiles.map((file) => file.file);
      let createdJobSuccessTitle: string | null = null;
      let createdJobSuccessMessage: string | null = null;

      const normalizedTasks = form.tasks.map((task, index) => ({
        ...task,
        title: resolveTaskTitle(task, index),
        assignee_id: task.assignee_id,
        checklist_items: normalizeTaskChecklistItems(task.checklist_items)
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

      let createdJobId: string | null = null;

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
              checklist_items: task.checklist_items,
              assignee_ids: task.assignee_id ? [task.assignee_id] : []
            }))
          })
        });

        const result = (await response.json()) as { error?: string; warning?: string; jobCode?: string; jobId?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Falha ao criar job.");
        }

        createdJobSuccessTitle = result.jobCode ? `Job ${result.jobCode} criado com sucesso` : "Job criado com sucesso";
        createdJobSuccessMessage = result.warning
          ? result.warning
          : result.jobCode
            ? `O job ${result.jobCode} foi criado com sucesso.`
            : "O job foi criado com sucesso.";

        createdJobId = result.jobId ?? null;
      }

      if (createdJobId) {
        let finalSuccessMessage = createdJobSuccessMessage ?? "O job foi criado com sucesso.";

        if (pendingFilesToUpload.length > 0) {
          try {
            const uploadedCount = await uploadMediaFilesToJob({
              files: pendingFilesToUpload,
              jobId: createdJobId
            });

            finalSuccessMessage = `${finalSuccessMessage} ${formatAttachmentUploadSuccess(uploadedCount)}`;
            clearPendingJobMediaFiles();
          } catch (mediaUploadError) {
            finalSuccessMessage = `${finalSuccessMessage} ${
              mediaUploadError instanceof Error
                ? `Job criado, mas houve falha ao anexar a mídia: ${mediaUploadError.message}`
                : "Job criado, mas houve falha ao anexar a mídia."
            }`;
          }
        }

        setCreatedJobSummary({
          title: createdJobSuccessTitle ?? "Job criado com sucesso",
          message: finalSuccessMessage
        });
        resetForm({ preserveCreatedSummary: true });
        await loadData();
        return;
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
            {createdJobSummary ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 md:p-8">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-2xl font-semibold text-emerald-800 md:text-3xl">{createdJobSummary.title}</p>
                    <p className="mt-3 max-w-3xl text-sm text-emerald-900/80 md:text-base">{createdJobSummary.message}</p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => resetForm()}
                    className="inline-flex items-center justify-center whitespace-nowrap"
                  >
                    + Novo Job
                  </Button>
                </div>
              </div>
            ) : (
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
                <h3 className="text-sm font-semibold">Mídias do Job</h3>
                <div className="flex items-center gap-2">
                  <input
                    ref={mediaInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      void handleMediaInputChange(event);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="inline-flex items-center gap-2"
                    onClick={() => mediaInputRef.current?.click()}
                    disabled={uploadingJobMedia || saving || !isAdmin || readOnlyMode}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingJobMedia ? "Anexando..." : "Anexar arquivos"}
                  </Button>
                </div>
              </div>

              {!form.id ? (
                <p className="text-xs text-muted">
                  Você já pode anexar os arquivos agora. Eles serão enviados automaticamente ao salvar o job.
                </p>
              ) : null}

              {form.id && loadingJobMedia ? (
                <p className="text-sm text-muted">Carregando anexos...</p>
              ) : null}

              {!form.id && pendingJobMediaFiles.length === 0 ? (
                <p className="text-sm text-muted">Nenhum arquivo selecionado para este novo job.</p>
              ) : null}

              {!form.id && pendingJobMediaFiles.length > 0 ? (
                <div className="space-y-2">
                  {pendingJobMediaFiles.map((file) => (
                    <div
                      key={file.localId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-panelAlt px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-white">
                          {file.isImage && file.previewUrl ? (
                            <img src={file.previewUrl} alt={file.file_name} className="h-full w-full object-cover" />
                          ) : file.isVideo ? (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <Video className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <File className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{file.file_name}</p>
                          <p className="text-xs text-muted">
                            Pronto para envio • {formatFileSize(file.size_bytes)} • Selecionado em{" "}
                            {formatMediaAddedAt(file.created_at)}
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        className="inline-flex items-center gap-1"
                        disabled={!isAdmin || readOnlyMode}
                        onClick={() => removePendingJobMedia(file.localId)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              {form.id && !loadingJobMedia && jobMediaFiles.length === 0 ? (
                <p className="text-sm text-muted">Nenhum arquivo anexado neste job.</p>
              ) : null}

              {form.id && jobMediaFiles.length > 0 ? (
                <div className="space-y-2">
                  {jobMediaFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-panelAlt px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-white">
                          {file.isImage && file.previewUrl ? (
                            <img
                              src={file.previewUrl}
                              alt={file.file_name}
                              className="h-full w-full object-cover"
                            />
                          ) : file.isVideo ? (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <Video className="h-5 w-5" />
                            </div>
                          ) : file.mime_type?.includes("pdf") ? (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <File className="h-5 w-5" />
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted">
                              <File className="h-5 w-5" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-text">{file.file_name}</p>
                          <p className="text-xs text-muted">
                            Adicionado em {formatMediaAddedAt(file.created_at)} • {formatFileSize(file.size_bytes)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="inline-flex items-center gap-1"
                          onClick={() => {
                            void openMediaDownload(file);
                          }}
                        >
                          <FileDown className="h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          className="inline-flex items-center gap-1"
                          disabled={!isAdmin || deletingMediaId === file.id || readOnlyMode}
                          onClick={() => {
                            void handleDeleteMedia(file);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          {deletingMediaId === file.id ? "Apagando..." : "Apagar"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
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
                  {form.tasks.map((task, index) => {
                    const checklistProgress = getTaskChecklistProgress(task.checklist_items);
                    const taskDraftKey = getTaskChecklistDraftKey(task, index);
                    const checklistDraft = taskChecklistDrafts[taskDraftKey] ?? "";

                    return (
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

                        <div className="md:col-span-2 lg:col-span-4 rounded-xl border border-border/70 bg-white p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Checklist da tarefa</p>
                            <p className="text-xs font-semibold text-muted">
                              {checklistProgress.completed}/{checklistProgress.total} concluídos • {checklistProgress.percent}%
                            </p>
                          </div>

                          <div className="mt-2 h-2 w-full rounded-full bg-border/70">
                            <span
                              className="block h-2 rounded-full bg-brand transition-all duration-200"
                              style={{ width: `${checklistProgress.percent}%` }}
                            />
                          </div>

                          {task.checklist_items.length === 0 ? (
                            <p className="mt-3 text-xs text-muted">Nenhum item adicionado ainda.</p>
                          ) : (
                            <div className="mt-3 space-y-2">
                              {task.checklist_items.map((item) => (
                                <div
                                  key={item.id}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 bg-panel px-3 py-2"
                                >
                                  <label className="flex min-w-0 flex-1 items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={item.done}
                                      onChange={(event) => {
                                        toggleChecklistItem(index, item.id, event.target.checked);
                                      }}
                                      className="h-4 w-4 shrink-0 accent-[hsl(var(--brand))]"
                                    />
                                    <span
                                      className={cn(
                                        "truncate text-sm text-text",
                                        item.done ? "text-muted line-through decoration-2" : ""
                                      )}
                                    >
                                      {item.text}
                                    </span>
                                  </label>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 px-2.5 text-xs text-muted hover:text-danger"
                                    onClick={() => removeChecklistItem(index, item.id)}
                                  >
                                    Remover
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={checklistDraft}
                              onChange={(event) => setChecklistDraft(task, index, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  addChecklistItem(index);
                                }
                              }}
                              placeholder="Adicionar item de checklist"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="sm:min-w-[132px]"
                              onClick={() => addChecklistItem(index)}
                            >
                              Adicionar item
                            </Button>
                          </div>
                        </div>
                      </div>
                      </div>
                    );
                  })}
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
            )}
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
