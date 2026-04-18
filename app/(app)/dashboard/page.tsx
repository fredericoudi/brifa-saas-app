import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { TrialActivationCard } from "@/components/commercial/trial-activation-card";
import { TeamLoadCardCarousel } from "@/components/dashboard/team-load-card-carousel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth";
import { getAgencyCommercialContext } from "@/lib/commercial";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { getTaskChecklistProgress, getTaskProgressPercent, normalizeTaskChecklistItems } from "@/lib/task-checklist";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn, formatDate, getStatusBadgeVariant, JOB_STATUS_LABEL, TASK_STATUS_LABEL, toPercent } from "@/lib/utils";

type DashboardJob = {
  id: string;
  title: string;
  job_code: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  created_at: string | null;
  client: { name: string } | null;
  archived_at?: string | null;
};

type DashboardTask = {
  id: string;
  job_id: string;
  title: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  assigned_to: string | null;
  estimated_hours: number;
  checklist_items?: unknown;
  created_at: string;
};

type DashboardUser = {
  id: string;
  name: string;
  weekly_capacity_hours: number;
};

type DashboardAssignment = {
  task_id: string;
  user_id: string;
};

type DashboardClient = {
  id: string;
  created_at: string | null;
};

function parseDueTimestamp(dueDate: string | null, dueTime?: string | null) {
  if (!dueDate) return Number.POSITIVE_INFINITY;
  const timePart = dueTime?.slice(0, 5) || "23:59";
  return new Date(`${dueDate}T${timePart}:00`).getTime();
}

function resolveDeadlineProgress(job: DashboardJob) {
  if (job.status === "finalizado") return 100;
  if (!job.due_date) return 0;

  const now = Date.now();
  const end = parseDueTimestamp(job.due_date, job.due_time);
  if (!Number.isFinite(end)) return 0;

  const start = job.created_at ? new Date(job.created_at).getTime() : now;
  const totalWindow = Math.max(end - start, 1);
  const elapsed = now - start;
  const progress = (elapsed / totalWindow) * 100;

  return Math.max(0, Math.min(100, Math.round(progress)));
}

function getStatusLabel(status: string) {
  return JOB_STATUS_LABEL[status] ?? TASK_STATUS_LABEL[status] ?? status;
}

function isMissingTaskChecklistItemsColumn(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("checklist_items") && normalized.includes("tasks") && normalized.includes("schema cache");
}

function buildMonthlyClientSeries(clients: DashboardClient[]) {
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short" });
  const now = new Date();
  const months = Array.from({ length: 4 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (3 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: formatter.format(date).replace(".", ""),
      total: 0
    };
  });

  const monthMap = new Map(months.map((month) => [month.key, month]));

  for (const client of clients) {
    if (!client.created_at) continue;
    const createdAt = new Date(client.created_at);
    const key = `${createdAt.getFullYear()}-${createdAt.getMonth()}`;
    const entry = monthMap.get(key);
    if (entry) {
      entry.total += 1;
    }
  }

  return months;
}

function DashboardMetricCard({
  value,
  label,
  iconSrc,
  iconAlt
}: {
  value: number | string;
  label: string;
  iconSrc: string;
  iconAlt: string;
}) {
  return (
    <Card className="h-full rounded-[28px] border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)]">
      <CardContent className="flex min-h-[150px] flex-col justify-between p-6">
        <div>
          <p className="text-[3.15rem] font-semibold leading-none tracking-[-0.04em] text-text">{value}</p>
          <p className="mt-3 max-w-[12rem] text-sm font-medium leading-5 text-muted">{label}</p>
        </div>

        <div className="flex justify-end">
          <img src={iconSrc} alt={iconAlt} width={40} height={40} className="h-10 w-10 object-contain" />
        </div>
      </CardContent>
    </Card>
  );
}

function ClientLineChart({ values }: { values: number[] }) {
  const width = 280;
  const height = 110;
  const padding = 8;
  const maxValue = Math.max(...values, 1);
  const step = values.length > 1 ? (width - padding * 2) / (values.length - 1) : width / 2;

  const points = values.map((value, index) => {
    const x = padding + step * index;
    const y = height - padding - (value / maxValue) * (height - padding * 2);
    return { x, y };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const focus = points.at(-1) ?? { x: width / 2, y: height / 2 };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full overflow-visible">
      <defs>
        <linearGradient id="clients-line" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8fdcff" />
          <stop offset="100%" stopColor="hsl(var(--brand))" />
        </linearGradient>
      </defs>

      {[0.2, 0.5, 0.8].map((line) => (
        <line
          key={line}
          x1={padding}
          x2={width - padding}
          y1={height * line}
          y2={height * line}
          stroke="#dfe6f4"
          strokeDasharray="4 6"
          strokeWidth="1"
        />
      ))}

      <polyline fill="none" stroke="url(#clients-line)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
      <circle cx={focus.x} cy={focus.y} r="7" fill="hsl(var(--brand))" stroke="#fff" strokeWidth="4" />
    </svg>
  );
}

function NewClientsCard({
  clientsByMonth,
  totalClients
}: {
  clientsByMonth: Array<{ key: string; label: string; total: number }>;
  totalClients: number;
}) {
  const currentMonthTotal = clientsByMonth.at(-1)?.total ?? 0;

  return (
    <Card className="min-h-[308px] rounded-[28px] border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)]">
      <CardHeader className="relative z-10 border-b-0 bg-panel shadow-[0_10px_14px_-14px_rgba(15,23,42,0.34)]">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Novos Clientes</h2>
      </CardHeader>
      <CardContent className="pt-5">
        <div className="space-y-5">
          <div className="inline-flex min-w-[112px] flex-col rounded-[18px] border border-border/80 bg-panel px-4 py-3 shadow-soft">
            <p className="text-lg font-semibold tracking-tight text-text">{currentMonthTotal}</p>
            <p className="text-xs text-muted">{currentMonthTotal === 1 ? "novo cliente" : "novos clientes"}</p>
          </div>

          <ClientLineChart values={clientsByMonth.map((month) => month.total)} />

          <div className="flex items-center justify-between text-xs font-medium text-muted">
            <div className="flex items-center gap-5">
              {clientsByMonth.map((month) => (
                <span key={month.key}>{month.label}</span>
              ))}
            </div>
            <span>{totalClients} total</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type DashboardTaskCardItem = {
  id: string;
  jobCode: string;
  jobTitle: string;
  clientName: string | null;
  status: string;
  createdAt: string | null;
  dueDate: string | null;
  dueTime: string | null;
  assigneeNames: string[];
  checklistTotal: number;
  checklistCompleted: number;
  progressPercent: number;
};

function DashboardTasksCard({
  tasks
}: {
  tasks: DashboardTaskCardItem[];
}) {
  const remaining = Math.max(tasks.length - 3, 0);
  const preview = tasks.slice(0, 3);

  return (
    <Card className="overflow-hidden rounded-[28px] border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)]">
      <CardHeader className="relative z-10 border-b-0 bg-panel shadow-[0_10px_14px_-14px_rgba(15,23,42,0.34)]">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Tarefas</h2>
      </CardHeader>
      <CardContent className="space-y-0 px-0 py-0">
        {preview.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted md:px-0">Nenhuma tarefa em andamento.</p>
        ) : (
          preview.map((task, index) => {
            return (
              <div
                key={task.id}
                className={cn("space-y-3 px-5 py-5 md:px-0", index > 0 ? "border-t border-[#ececec]" : "")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-brand">{task.jobCode}</p>
                    <p className="text-sm font-semibold text-text">{task.jobTitle}</p>
                  </div>
                  <Badge
                    variant={getStatusBadgeVariant(task.status)}
                    className="border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]"
                  >
                    {getStatusLabel(task.status)}
                  </Badge>
                </div>

                <div className="space-y-1 text-xs text-muted">
                  <p>
                    Cliente: <span className="font-medium text-text">{task.clientName ?? "-"}</span>
                  </p>
                  <p className="truncate">
                    Responsável:{" "}
                    <span className="font-medium text-text">
                      {task.assigneeNames.length > 0 ? task.assigneeNames.join(", ") : "-"}
                    </span>
                  </p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-muted">
                    <p>Progresso</p>
                    <p className="font-semibold text-text">{task.progressPercent}%</p>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#dadada]">
                    <span
                      className="block h-2 rounded-full bg-brand transition-all duration-200"
                      style={{ width: `${task.progressPercent}%` }}
                    />
                  </div>
                  {task.checklistTotal > 0 ? (
                    <p className="text-[11px] text-muted">
                      {task.checklistCompleted}/{task.checklistTotal} itens concluídos
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between gap-2 text-xs text-muted">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    <span>Criado em {formatDate(task.createdAt)}</span>
                  </div>
                  <span className="font-semibold text-text">
                    {formatDate(task.dueDate)}
                    {task.dueTime ? ` • ${task.dueTime.slice(0, 5)}` : ""}
                  </span>
                </div>
              </div>
            );
          })
        )}

        <div className="border-t border-[#ececec] px-5 py-5 md:px-0">
          <Link
            href="tasks"
            className="inline-flex h-12 w-full items-center justify-center rounded-[18px] bg-brandMuted font-semibold text-brand transition hover:brightness-[0.98]"
          >
            {remaining > 0 ? `Ver mais ${remaining} tarefas` : "Abrir tarefas"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function DeadlineProgressRing({ progress }: { progress: number }) {
  const size = 62;
  const strokeBase = 2;
  const strokeProgress = 5;
  const radius = (size - strokeProgress) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressLength = (circumference * progress) / 100;

  return (
    <div className="relative inline-flex h-[62px] w-[62px] items-center justify-center">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-[62px] w-[62px]">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#cfcfcf" strokeWidth={strokeBase} />
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
      <img src="/icons/dashboard/energy-1.svg" alt="" width={24} height={24} className="absolute h-6 w-6 object-contain" />
    </div>
  );
}

function DashboardJobsCard({
  jobs
}: {
  jobs: DashboardJob[];
}) {
  const remaining = Math.max(jobs.length - 3, 0);
  const preview = jobs.slice(0, 3);

  return (
    <Card className="overflow-hidden rounded-[28px] border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)]">
      <CardHeader className="relative z-10 border-b-0 bg-panel shadow-[0_10px_14px_-14px_rgba(15,23,42,0.34)]">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Jobs em Andamento</h2>
      </CardHeader>
      <CardContent className="space-y-0 px-0 py-0">
        {preview.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted md:px-0">Nenhum job ativo no momento.</p>
        ) : (
          preview.map((job, index) => (
            <div
              key={job.id}
              className={cn("space-y-3 px-5 py-5 md:px-0", index > 0 ? "border-t border-[#ececec]" : "")}
            >
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-brand">{job.client?.name ?? "Cliente não informado"}</p>
                <p className="text-sm font-semibold text-text">{job.title}</p>
              </div>

              <div className="space-y-2 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>Criado em {formatDate(job.created_at)}</span>
                </div>

                <div className="flex items-center gap-2">
                  <DeadlineProgressRing progress={resolveDeadlineProgress(job)} />
                  <div className="space-y-0.5">
                    <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Deadline</p>
                    <p className="text-sm font-semibold text-text">
                      {formatDate(job.due_date)}
                      {job.due_time ? ` • ${job.due_time.slice(0, 5)}` : ""}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <Badge variant={getStatusBadgeVariant(job.status)} className="border-0 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.05em]">
                  {JOB_STATUS_LABEL[job.status] ?? job.status}
                </Badge>
                <span className="text-xs text-muted">{job.job_code}</span>
              </div>
            </div>
          ))
        )}

        <div className="border-t border-[#ececec] px-5 py-5 md:px-0">
          <Link
            href="jobs"
            className="inline-flex h-12 w-full items-center justify-center rounded-[18px] bg-brandMuted font-semibold text-brand transition hover:brightness-[0.98]"
          >
            {remaining > 0 ? `Ver mais ${remaining} jobs` : "Abrir jobs"}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();
  const commercialContext = await getAgencyCommercialContext({
    supabase,
    agencyId: profile.agency_id
  });
  const canManageTrial = profile.role === "admin" || profile.platform_role === "super_admin";

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
    throw new Error(jobsResponse.error.message);
  }

  let tasksResponse = await supabase
    .from("tasks")
    .select("id, job_id, title, status, due_date, due_time, assigned_to, estimated_hours, checklist_items, created_at")
    .eq("agency_id", profile.agency_id);

  if (tasksResponse.error && isMissingTaskChecklistItemsColumn(tasksResponse.error.message)) {
    tasksResponse = await supabase
      .from("tasks")
      .select("id, job_id, title, status, due_date, due_time, assigned_to, estimated_hours, created_at")
      .eq("agency_id", profile.agency_id);
  }

  if (tasksResponse.error) {
    throw new Error(tasksResponse.error.message);
  }

  const [{ data: rawUsers }, { data: rawTaskAssignments }, { data: rawClients }] = await Promise.all([
    supabase
      .from("users")
      .select("id, name, weekly_capacity_hours")
      .eq("agency_id", profile.agency_id)
      .order("name", { ascending: true }),
    supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .eq("agency_id", profile.agency_id),
    supabase.from("clients").select("id, created_at").eq("agency_id", profile.agency_id)
  ]);

  const jobs = ((jobsResponse.data as DashboardJob[] | null) ?? []).filter((job) => !job.archived_at);
  const tasks = (tasksResponse.data as DashboardTask[] | null) ?? [];
  const users = (rawUsers as DashboardUser[] | null) ?? [];
  const taskAssignments = (rawTaskAssignments as DashboardAssignment[] | null) ?? [];
  const clients = (rawClients as DashboardClient[] | null) ?? [];

  const today = new Date();

  const jobsAtivos = jobs.filter((job) => job.status !== "finalizado").length;
  const jobsAtrasados = jobs.filter((job) => {
    if (!job.due_date || job.status === "finalizado") return false;
    return new Date(job.due_date) < today;
  }).length;

  const tarefasEmAndamento = tasks.filter((task) => task.status === "em_andamento").length;
  const tarefasAtrasadas = tasks.filter((task) => {
    if (!task.due_date || task.status === "concluido") return false;
    return new Date(task.due_date) < today;
  }).length;

  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const assignmentsByUser = new Map<string, string[]>();

  for (const assignment of taskAssignments) {
    const current = assignmentsByUser.get(assignment.user_id) ?? [];
    current.push(assignment.task_id);
    assignmentsByUser.set(assignment.user_id, current);
  }

  const loadByUser = users.map((user) => {
    const taskIds = [...new Set(assignmentsByUser.get(user.id) ?? [])];
    const activeHours = taskIds
      .map((taskId) => tasksById.get(taskId))
      .filter((task) => task && task.status !== "concluido")
      .reduce((sum, task) => sum + Number(task?.estimated_hours ?? 0), 0);

    const capacity = Number(user.weekly_capacity_hours || 40);
    const percent = capacity > 0 ? (activeHours / capacity) * 100 : 0;

    return {
      id: user.id,
      name: user.name,
      activeHours,
      capacity,
      percent: toPercent(percent)
    };
  });

  const usersById = new Map(users.map((user) => [user.id, user.name]));
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const assigneesByTask = new Map<string, Set<string>>();

  for (const assignment of taskAssignments) {
    const current = assigneesByTask.get(assignment.task_id) ?? new Set<string>();
    current.add(assignment.user_id);
    assigneesByTask.set(assignment.task_id, current);
  }

  const taskPanelItems = tasks
    .filter((task) => task.status !== "concluido")
    .map((task) => {
      const job = jobsById.get(task.job_id);
      const checklistItems = normalizeTaskChecklistItems(task.checklist_items);
      const checklistProgress = getTaskChecklistProgress(checklistItems);

      const assigneeIds = new Set<string>(assigneesByTask.get(task.id) ?? []);
      if (task.assigned_to) {
        assigneeIds.add(task.assigned_to);
      }

      const assigneeNames = [...assigneeIds]
        .map((userId) => usersById.get(userId))
        .filter((name): name is string => Boolean(name));

      return {
        id: task.id,
        jobCode: job?.job_code ?? "Sem código",
        jobTitle: job?.title ?? task.title,
        clientName: job?.client?.name ?? null,
        status: task.status,
        createdAt: job?.created_at ?? task.created_at,
        dueDate: job?.due_date ?? task.due_date,
        dueTime: job?.due_time ?? task.due_time,
        assigneeNames,
        assigneeIds,
        checklistTotal: checklistProgress.total,
        checklistCompleted: checklistProgress.completed,
        progressPercent: getTaskProgressPercent({
          checklistItems,
          status: task.status
        })
      };
    })
    .filter((item) =>
      profile.role === "admin" || profile.platform_role === "super_admin" ? true : item.assigneeIds.has(profile.id)
    )
    .sort((a, b) => {
      const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bDate - aDate;
    });

  const highlightedLoad = [...loadByUser].sort((a, b) => b.percent - a.percent).slice(0, 4);
  const activeJobs = [...jobs]
    .filter((job) => job.status !== "finalizado")
    .sort((a, b) => parseDueTimestamp(a.due_date, a.due_time) - parseDueTimestamp(b.due_date, b.due_time));
  const clientsByMonth = buildMonthlyClientSeries(clients);

  const metrics = [
    {
      label: "Jobs Ativos",
      value: jobsAtivos,
      iconSrc: "/icons/dashboard/ic-projects.svg",
      iconAlt: "Ícone de projetos"
    },
    {
      label: "Jobs Atrasados",
      value: jobsAtrasados,
      iconSrc: "/icons/dashboard/ic-contact.svg",
      iconAlt: "Ícone de contato"
    },
    {
      label: "Tarefas em Andamento",
      value: tarefasEmAndamento,
      iconSrc: "/icons/dashboard/ic-kanban.svg",
      iconAlt: "Ícone de kanban"
    },
    {
      label: "Tarefas Atrasadas",
      value: tarefasAtrasadas,
      iconSrc: "/icons/dashboard/ic-messages.svg",
      iconAlt: "Ícone de mensagens"
    }
  ] as const;

  return (
    <div className="space-y-5 pt-[20px]">
      {canManageTrial && !commercialContext.trial.activated ? <TrialActivationCard /> : null}

      <section className="grid gap-5 xl:grid-cols-4">
        <div className="space-y-5 xl:col-span-2">
          <section className="grid gap-5 sm:grid-cols-2">
            {metrics.map((metric) => (
              <DashboardMetricCard
                key={metric.label}
                value={metric.value}
                label={metric.label}
                iconSrc={metric.iconSrc}
                iconAlt={metric.iconAlt}
              />
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <TeamLoadCardCarousel highlightedLoad={highlightedLoad} />
            <NewClientsCard clientsByMonth={clientsByMonth} totalClients={clients.length} />
          </section>
        </div>

        <DashboardTasksCard tasks={taskPanelItems} />
        <DashboardJobsCard jobs={activeJobs} />
      </section>

      <section className="grid gap-4 xl:hidden">
        <Card className="rounded-[28px]">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div className="min-w-0 max-w-[56%]">
              <p className="text-sm font-semibold text-text">Operação da agência</p>
              <p className="mt-1 text-sm text-muted">Acesse rapidamente as áreas com maior volume hoje.</p>
            </div>
            <Link
              href="jobs"
              className="inline-flex h-11 min-w-[124px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[18px] bg-brand px-4 text-sm font-semibold text-white"
            >
              Ver jobs
              <ArrowRight className="h-4 w-4" />
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
