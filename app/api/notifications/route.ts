import { NextResponse } from "next/server";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import type { AgencyNotificationItem } from "@/lib/notifications";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const EVENT_LOOKBACK_HOURS = 72;
const DEADLINE_ALERT_WINDOW_HOURS = 48;
const MAX_NOTIFICATIONS = 20;

type ProfileContext = {
  id: string;
  agency_id: string;
  role: string;
  platform_role: string;
};

type JobRow = {
  id: string;
  title: string;
  job_code: string | null;
  status: string;
  due_date: string | null;
  due_time: string | null;
  created_at: string | null;
  archived_at?: string | null;
  client: { name: string } | null;
};

type TaskRow = {
  id: string;
  job_id: string;
  title: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  created_at: string;
};

type JobEventRow = {
  id: string;
  job_id: string;
  user_id: string | null;
  event_type: string;
  description: string;
  created_at: string;
};

type UserNameRow = {
  id: string;
  name: string;
};

function parseDueTimestamp(dueDate: string | null, dueTime: string | null) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const timePart = dueTime?.slice(0, 5) || "23:59";
  return new Date(`${dueDate}T${timePart}:00`).getTime();
}

function buildDueIsoString(dueDate: string | null, dueTime: string | null) {
  if (!dueDate) return new Date().toISOString();
  const timePart = dueTime?.slice(0, 5) || "23:59";
  return new Date(`${dueDate}T${timePart}:00`).toISOString();
}

function formatDeadlineLabel(dueDate: string | null, dueTime: string | null) {
  if (!dueDate) return "sem prazo definido";
  const date = new Date(`${dueDate}T00:00:00`);
  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
  return dueTime ? `${dateLabel} às ${dueTime.slice(0, 5)}` : dateLabel;
}

function getEventTitle(eventType: string) {
  switch (eventType) {
    case "job_created":
      return "Novo job criado";
    case "job_status_changed":
      return "Status do job alterado";
    case "task_created":
      return "Nova tarefa adicionada";
    case "task_edited":
      return "Tarefa atualizada";
    case "task_completed":
      return "Tarefa concluída";
    case "assignee_defined":
      return "Responsável atualizado";
    case "briefing_updated":
      return "Briefing atualizado";
    case "file_attached":
      return "Arquivo anexado";
    case "file_deleted":
      return "Arquivo removido";
    case "job_archived":
      return "Job arquivado";
    default:
      return "Atualização no job";
  }
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("users")
      .select("id, agency_id, role, platform_role")
      .eq("id", user.id)
      .maybeSingle();

    const profile = profileData as ProfileContext | null;

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const isAdmin = profile.role === "admin" || profile.platform_role === "super_admin";

    let jobsResponse = await supabase
      .from("jobs")
      .select("id, title, job_code, status, due_date, due_time, created_at, archived_at, client:clients(name)")
      .eq("agency_id", profile.agency_id)
      .is("archived_at", null);

    if (jobsResponse.error && isMissingJobsArchivedAtColumn(jobsResponse.error)) {
      jobsResponse = await supabase
        .from("jobs")
        .select("id, title, job_code, status, due_date, due_time, created_at, client:clients(name)")
        .eq("agency_id", profile.agency_id);
    }

    if (jobsResponse.error) {
      return NextResponse.json({ error: jobsResponse.error.message }, { status: 500 });
    }

    const jobs = ((jobsResponse.data as JobRow[] | null) ?? []).filter((job) => !job.archived_at);
    const jobsById = new Map(jobs.map((job) => [job.id, job]));

    let relevantTaskIds: string[] | null = null;
    if (!isAdmin) {
      const { data: taskAssignees, error: assigneesError } = await supabase
        .from("task_assignees")
        .select("task_id")
        .eq("agency_id", profile.agency_id)
        .eq("user_id", profile.id);

      if (assigneesError) {
        return NextResponse.json({ error: assigneesError.message }, { status: 500 });
      }

      relevantTaskIds = [...new Set((taskAssignees ?? []).map((item) => item.task_id))];
      if (relevantTaskIds.length === 0) {
        const response = {
          notifications: [] as AgencyNotificationItem[],
          count: 0
        };
        return NextResponse.json(response);
      }
    }

    let tasksQuery = supabase
      .from("tasks")
      .select("id, job_id, title, status, due_date, due_time, assigned_to, created_at")
      .eq("agency_id", profile.agency_id)
      .neq("status", "concluido");

    if (!isAdmin && relevantTaskIds) {
      tasksQuery = tasksQuery.in("id", relevantTaskIds);
    }

    const { data: rawTasks, error: tasksError } = await tasksQuery;
    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 500 });
    }

    const tasks = (rawTasks as TaskRow[] | null) ?? [];
    const relevantJobIds = isAdmin
      ? jobs.map((job) => job.id)
      : [...new Set(tasks.map((task) => task.job_id))];

    const now = Date.now();
    const deadlineWindowMs = DEADLINE_ALERT_WINDOW_HOURS * 60 * 60 * 1000;
    const dueNotifications: AgencyNotificationItem[] = [];

    for (const task of tasks) {
      if (!task.due_date) continue;
      const dueAt = parseDueTimestamp(task.due_date, task.due_time);
      if (!Number.isFinite(dueAt)) continue;
      const relatedJob = jobsById.get(task.job_id);
      const jobLabel = relatedJob?.job_code ?? relatedJob?.title ?? "Job";
      const deadlineLabel = formatDeadlineLabel(task.due_date, task.due_time);

      if (dueAt < now) {
        dueNotifications.push({
          id: `task-overdue-${task.id}`,
          type: "task_overdue",
          title: "Tarefa atrasada",
          message: `"${task.title}" (${jobLabel}) venceu em ${deadlineLabel}.`,
          createdAt: buildDueIsoString(task.due_date, task.due_time),
          path: relatedJob ? `/jobs/${relatedJob.id}` : "/tasks",
          tone: "danger"
        });
      } else if (dueAt - now <= deadlineWindowMs) {
        dueNotifications.push({
          id: `task-near-${task.id}`,
          type: "task_due_soon",
          title: "Prazo de tarefa chegando",
          message: `"${task.title}" (${jobLabel}) vence em ${deadlineLabel}.`,
          createdAt: buildDueIsoString(task.due_date, task.due_time),
          path: relatedJob ? `/jobs/${relatedJob.id}` : "/tasks",
          tone: "warning"
        });
      }
    }

    if (isAdmin) {
      for (const job of jobs) {
        if (job.status === "finalizado" || !job.due_date) continue;
        const dueAt = parseDueTimestamp(job.due_date, job.due_time);
        if (!Number.isFinite(dueAt)) continue;
        const deadlineLabel = formatDeadlineLabel(job.due_date, job.due_time);
        const clientLabel = job.client?.name ? ` • ${job.client.name}` : "";

        if (dueAt < now) {
          dueNotifications.push({
            id: `job-overdue-${job.id}`,
            type: "job_overdue",
            title: "Job atrasado",
            message: `${job.job_code ?? job.title}${clientLabel} venceu em ${deadlineLabel}.`,
            createdAt: buildDueIsoString(job.due_date, job.due_time),
            path: `/jobs/${job.id}`,
            tone: "danger"
          });
        } else if (dueAt - now <= deadlineWindowMs) {
          dueNotifications.push({
            id: `job-near-${job.id}`,
            type: "job_due_soon",
            title: "Prazo de job chegando",
            message: `${job.job_code ?? job.title}${clientLabel} vence em ${deadlineLabel}.`,
            createdAt: buildDueIsoString(job.due_date, job.due_time),
            path: `/jobs/${job.id}`,
            tone: "warning"
          });
        }
      }
    }

    const eventNotifications: AgencyNotificationItem[] = [];
    if (relevantJobIds.length > 0) {
      const eventsSince = new Date(now - EVENT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
      const { data: rawEvents, error: eventsError } = await supabase
        .from("job_events")
        .select("id, job_id, user_id, event_type, description, created_at")
        .in("job_id", relevantJobIds)
        .gte("created_at", eventsSince)
        .order("created_at", { ascending: false })
        .limit(40);

      if (eventsError) {
        return NextResponse.json({ error: eventsError.message }, { status: 500 });
      }

      const jobEvents = (rawEvents as JobEventRow[] | null) ?? [];
      const userIds = [...new Set(jobEvents.map((event) => event.user_id).filter((value): value is string => Boolean(value)))];
      const usersById = new Map<string, string>();

      if (userIds.length > 0) {
        const { data: eventUsers, error: usersError } = await supabase
          .from("users")
          .select("id, name")
          .in("id", userIds);

        if (usersError) {
          return NextResponse.json({ error: usersError.message }, { status: 500 });
        }

        for (const eventUser of (eventUsers as UserNameRow[] | null) ?? []) {
          usersById.set(eventUser.id, eventUser.name);
        }
      }

      for (const event of jobEvents) {
        const relatedJob = jobsById.get(event.job_id);
        const actorName = event.user_id ? usersById.get(event.user_id) : null;
        const prefix = relatedJob?.job_code ?? relatedJob?.title ?? "Job";
        const actorLabel = actorName ? ` • por ${actorName}` : "";

        eventNotifications.push({
          id: `event-${event.id}`,
          type: event.event_type,
          title: getEventTitle(event.event_type),
          message: `${prefix}: ${event.description}${actorLabel}`,
          createdAt: event.created_at,
          path: `/jobs/${event.job_id}`,
          tone: "info"
        });
      }
    }

    const notifications = [...dueNotifications, ...eventNotifications]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, MAX_NOTIFICATIONS);

    return NextResponse.json({
      notifications,
      count: notifications.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao carregar notificações."
      },
      { status: 500 }
    );
  }
}
