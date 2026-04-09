import Link from "next/link";
import {
  AlarmClock,
  ArrowRight,
  CalendarDays,
  LayoutGrid,
  MessageSquareText,
  Star,
  Zap
} from "lucide-react";
import { TrialActivationCard } from "@/components/commercial/trial-activation-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireAuth } from "@/lib/auth";
import { getAgencyCommercialContext } from "@/lib/commercial";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cn, formatDate, JOB_STATUS_LABEL, TASK_STATUS_LABEL, toPercent } from "@/lib/utils";

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
  title: string;
  status: string;
  due_date: string | null;
  due_time: string | null;
  estimated_hours: number;
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

function resolveTaskBadgeVariant(status: string): "neutral" | "brand" | "warning" | "success" {
  if (status === "concluido") return "success";
  if (status === "em_andamento") return "brand";
  if (status === "revisao") return "warning";
  return "neutral";
}

function resolveJobBadgeVariant(status: string): "neutral" | "brand" | "warning" | "success" {
  if (status === "finalizado") return "success";
  if (status === "aprovado") return "brand";
  if (status === "revisao") return "warning";
  return "neutral";
}

function resolveTaskProgress(status: string) {
  switch (status) {
    case "briefing":
      return 36;
    case "criacao":
      return 54;
    case "em_andamento":
      return 68;
    case "revisao":
      return 79;
    case "aprovado":
      return 92;
    case "concluido":
      return 100;
    default:
      return 24;
  }
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
  icon: Icon
}: {
  value: number | string;
  label: string;
  icon: typeof Star;
}) {
  return (
    <Card className="h-full rounded-[28px]">
      <CardContent className="flex min-h-[150px] flex-col justify-between p-6">
        <div>
          <p className="text-[3.15rem] font-semibold leading-none tracking-[-0.04em] text-text">{value}</p>
          <p className="mt-3 max-w-[12rem] text-sm font-medium leading-5 text-muted">{label}</p>
        </div>

        <div className="flex justify-end">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brandMuted text-brand">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamLoadCard({
  highlightedLoad
}: {
  highlightedLoad: Array<{
    id: string;
    name: string;
    activeHours: number;
    capacity: number;
    percent: number;
  }>;
}) {
  const lead = highlightedLoad[0] ?? null;

  return (
    <Card className="min-h-[308px] rounded-[28px]">
      <CardHeader className="border-b-0 pb-0">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Carga da Equipe</h2>
      </CardHeader>
      <CardContent className="pt-4">
        {!lead ? (
          <p className="text-sm text-muted">Nenhum membro encontrado.</p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm font-semibold text-text">{lead.name}</p>

            <div className="flex justify-center">
              <div
                className="grid h-40 w-40 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#56c7ee 0deg ${Math.max(lead.percent * 1.25, 40)}deg, hsl(var(--brand)) ${Math.max(
                    lead.percent * 1.25,
                    40
                  )}deg ${lead.percent * 3.6}deg, #e7eefc ${lead.percent * 3.6}deg 360deg)`
                }}
              >
                <div className="grid h-28 w-28 place-items-center rounded-full bg-panel">
                  <p className="text-[1.7rem] font-semibold tracking-tight text-text">{lead.percent}%</p>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-center text-xs text-muted">
              <p>{lead.activeHours} horas planejadas</p>
              <p>{lead.capacity} horas de capacidade semanal</p>
            </div>

            {highlightedLoad.length > 1 ? (
              <div className="space-y-2">
                {highlightedLoad.slice(1).map((member) => (
                  <div key={member.id} className="flex items-center justify-between gap-3 rounded-2xl bg-panelAlt/55 px-3 py-2.5">
                    <p className="truncate text-sm font-medium text-text">{member.name}</p>
                    <p className="text-xs font-semibold text-muted">{member.percent}%</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
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
    <Card className="min-h-[308px] rounded-[28px]">
      <CardHeader className="border-b-0 pb-0">
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

function StageDots({ filled }: { filled: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: 4 }).map((_, index) => (
        <span
          key={index}
          className={cn(
            "h-3.5 w-3.5 rounded-full border border-[#d8deec]",
            index < filled ? "bg-[#c8cfdd]" : "bg-transparent"
          )}
        />
      ))}
    </div>
  );
}

function DashboardTasksCard({
  tasks
}: {
  tasks: DashboardTask[];
}) {
  const remaining = Math.max(tasks.length - 3, 0);
  const preview = tasks.slice(0, 3);

  return (
    <Card className="overflow-hidden rounded-[28px]">
      <CardHeader>
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Tarefas</h2>
      </CardHeader>
      <CardContent className="space-y-0 px-0 py-0">
        {preview.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted">Nenhuma tarefa em andamento.</p>
        ) : (
          preview.map((task, index) => {
            const progress = resolveTaskProgress(task.status);

            return (
              <div key={task.id} className={cn("space-y-3 px-6 py-5", index > 0 ? "border-t border-border/80" : "")}>
                <Badge variant={resolveTaskBadgeVariant(task.status)} className="border-0 px-3 py-1 text-[11px] font-semibold">
                  {TASK_STATUS_LABEL[task.status] ?? task.status}
                </Badge>
                <p className="text-sm font-semibold text-text">{task.title}</p>

                <div className="flex items-center gap-3">
                  <StageDots filled={Math.max(1, Math.ceil(progress / 25))} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted">
                      <span>Progresso</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#e4e9f5]">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div className="border-t border-border/80 px-6 py-5">
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

function DashboardJobsCard({
  jobs
}: {
  jobs: DashboardJob[];
}) {
  const remaining = Math.max(jobs.length - 3, 0);
  const preview = jobs.slice(0, 3);

  return (
    <Card className="overflow-hidden rounded-[28px]">
      <CardHeader>
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Jobs em Andamento</h2>
      </CardHeader>
      <CardContent className="space-y-0 px-0 py-0">
        {preview.length === 0 ? (
          <p className="px-6 py-6 text-sm text-muted">Nenhum job ativo no momento.</p>
        ) : (
          preview.map((job, index) => (
            <div key={job.id} className={cn("space-y-3 px-6 py-5", index > 0 ? "border-t border-border/80" : "")}>
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
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brandMuted text-brand">
                    <Zap className="h-3.5 w-3.5" />
                  </span>
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
                <Badge variant={resolveJobBadgeVariant(job.status)} className="border-0 px-3 py-1 text-[11px] font-semibold">
                  {JOB_STATUS_LABEL[job.status] ?? job.status}
                </Badge>
                <span className="text-xs text-muted">{job.job_code}</span>
              </div>
            </div>
          ))
        )}

        <div className="border-t border-border/80 px-6 py-5">
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

  const [{ data: rawTasks }, { data: rawUsers }, { data: rawTaskAssignments }, { data: rawClients }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, due_date, due_time, estimated_hours")
      .eq("agency_id", profile.agency_id),
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
  const tasks = (rawTasks as DashboardTask[] | null) ?? [];
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

  const highlightedLoad = [...loadByUser].sort((a, b) => b.percent - a.percent).slice(0, 4);
  const activeTasks = [...tasks]
    .filter((task) => task.status !== "concluido")
    .sort((a, b) => parseDueTimestamp(a.due_date, a.due_time) - parseDueTimestamp(b.due_date, b.due_time));
  const activeJobs = [...jobs]
    .filter((job) => job.status !== "finalizado")
    .sort((a, b) => parseDueTimestamp(a.due_date, a.due_time) - parseDueTimestamp(b.due_date, b.due_time));
  const clientsByMonth = buildMonthlyClientSeries(clients);

  const metrics = [
    { label: "Jobs Ativos", value: jobsAtivos, icon: Star },
    { label: "Jobs Atrasados", value: jobsAtrasados, icon: AlarmClock },
    { label: "Tarefas em Andamento", value: tarefasEmAndamento, icon: LayoutGrid },
    { label: "Tarefas Atrasadas", value: tarefasAtrasadas, icon: MessageSquareText }
  ] as const;

  return (
    <div className="space-y-5">
      {canManageTrial && !commercialContext.trial.activated ? <TrialActivationCard /> : null}

      <section className="grid gap-5 2xl:grid-cols-[minmax(0,1.55fr)_350px_350px]">
        <div className="space-y-5">
          <section className="grid gap-5 sm:grid-cols-2">
            {metrics.map((metric) => (
              <DashboardMetricCard key={metric.label} value={metric.value} label={metric.label} icon={metric.icon} />
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <TeamLoadCard highlightedLoad={highlightedLoad} />
            <NewClientsCard clientsByMonth={clientsByMonth} totalClients={clients.length} />
          </section>
        </div>

        <DashboardTasksCard tasks={activeTasks} />
        <DashboardJobsCard jobs={activeJobs} />
      </section>

      <section className="grid gap-4 xl:hidden">
        <Card className="rounded-[28px]">
          <CardContent className="flex items-center justify-between gap-3 p-5">
            <div>
              <p className="text-sm font-semibold text-text">Operação da agência</p>
              <p className="mt-1 text-sm text-muted">Acesse rapidamente as áreas com maior volume hoje.</p>
            </div>
            <Link
              href="jobs"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-[18px] bg-brand px-4 text-sm font-semibold text-white"
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
