import { AgencyCalendarPage, type AgencyCalendarTask } from "@/components/calendar/agency-calendar-page";
import { requireAuth } from "@/lib/auth";
import type { Job, UserProfile } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { getTaskChecklistProgress, getTaskProgressPercent, normalizeTaskChecklistItems } from "@/lib/task-checklist";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CalendarTaskRow = {
  id: string;
  job_id: string;
  title: string;
  status: string;
  priority: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  checklist_items?: unknown;
  created_at: string;
};

type CalendarJobRow = Pick<Job, "id" | "title" | "job_code" | "client_id" | "archived_at"> & {
  client: { id: string; name: string } | null;
};

type AssignmentRow = {
  task_id: string;
  user_id: string;
};

type UserRow = Pick<UserProfile, "id" | "name">;

type ClientRow = {
  id: string;
  name: string;
};

function isMissingTaskChecklistItemsColumn(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("checklist_items") && normalized.includes("tasks") && normalized.includes("schema cache");
}

export default async function CalendarPage() {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const [{ data: rawUsers }, { data: rawClients }, { data: rawAssignments }] = await Promise.all([
    supabase.from("users").select("id, name").eq("agency_id", profile.agency_id).order("name", { ascending: true }),
    supabase.from("clients").select("id, name").eq("agency_id", profile.agency_id).order("name", { ascending: true }),
    supabase.from("task_assignees").select("task_id, user_id").eq("agency_id", profile.agency_id)
  ]);

  let jobsResponse = await supabase
    .from("jobs")
    .select("id, title, job_code, client_id, archived_at, client:clients(id, name)")
    .eq("agency_id", profile.agency_id);

  if (jobsResponse.error && isMissingJobsArchivedAtColumn(jobsResponse.error)) {
    jobsResponse = await supabase
      .from("jobs")
      .select("id, title, job_code, client_id, client:clients(id, name)")
      .eq("agency_id", profile.agency_id);
  }

  if (jobsResponse.error) {
    throw new Error(jobsResponse.error.message);
  }

  let tasksResponse = await supabase
    .from("tasks")
    .select("id, job_id, title, status, priority, due_date, due_time, assigned_to, checklist_items, created_at")
    .eq("agency_id", profile.agency_id)
    .not("due_date", "is", null);

  if (tasksResponse.error && isMissingTaskChecklistItemsColumn(tasksResponse.error.message)) {
    tasksResponse = await supabase
      .from("tasks")
      .select("id, job_id, title, status, priority, due_date, due_time, assigned_to, created_at")
      .eq("agency_id", profile.agency_id)
      .not("due_date", "is", null);
  }

  if (tasksResponse.error) {
    throw new Error(tasksResponse.error.message);
  }

  const jobs = ((jobsResponse.data as CalendarJobRow[] | null) ?? []).filter((job) => !job.archived_at);
  const tasks = (tasksResponse.data as CalendarTaskRow[] | null) ?? [];
  const users = (rawUsers as UserRow[] | null) ?? [];
  const clients = (rawClients as ClientRow[] | null) ?? [];
  const assignments = (rawAssignments as AssignmentRow[] | null) ?? [];

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const usersById = new Map(users.map((user) => [user.id, user.name]));
  const assigneesByTask = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const current = assigneesByTask.get(assignment.task_id) ?? new Set<string>();
    current.add(assignment.user_id);
    assigneesByTask.set(assignment.task_id, current);
  }

  const isAdmin = profile.role === "admin" || profile.platform_role === "super_admin";

  const visibleTasks: AgencyCalendarTask[] = tasks
    .map((task) => {
      const job = jobsById.get(task.job_id);
      if (!job || !task.due_date) return null;

      const checklistItems = normalizeTaskChecklistItems(task.checklist_items);
      const checklistProgress = getTaskChecklistProgress(checklistItems);
      const assigneeIds = new Set<string>(assigneesByTask.get(task.id) ?? []);

      if (task.assigned_to) {
        assigneeIds.add(task.assigned_to);
      }

      const resolvedAssigneeIds = [...assigneeIds];
      const assigneeNames = resolvedAssigneeIds
        .map((userId) => usersById.get(userId))
        .filter((value): value is string => Boolean(value));

      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.due_date,
        dueTime: task.due_time,
        createdAt: task.created_at,
        progressPercent: getTaskProgressPercent({
          checklistItems,
          status: task.status
        }),
        checklistTotal: checklistProgress.total,
        checklistCompleted: checklistProgress.completed,
        clientId: job.client_id,
        clientName: job.client?.name ?? null,
        assigneeIds: resolvedAssigneeIds,
        assigneeNames,
        jobId: job.id,
        jobCode: job.job_code,
        jobTitle: job.title
      } satisfies AgencyCalendarTask;
    })
    .filter((task): task is AgencyCalendarTask => Boolean(task))
    .filter((task) => (isAdmin ? true : task.assigneeIds.includes(profile.id)));

  const availableClientIds = new Set(visibleTasks.map((task) => task.clientId).filter((value): value is string => Boolean(value)));
  const availableUserIds = new Set(visibleTasks.flatMap((task) => task.assigneeIds));

  const clientOptions = clients.filter((client) => availableClientIds.has(client.id));
  const userOptions = isAdmin ? users.filter((user) => availableUserIds.has(user.id)) : users.filter((user) => user.id === profile.id);

  return (
    <div className="pt-[20px]">
      <AgencyCalendarPage tasks={visibleTasks} users={userOptions} clients={clientOptions} isAdmin={isAdmin} currentUserId={profile.id} />
    </div>
  );
}
