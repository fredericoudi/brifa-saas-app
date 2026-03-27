import { MetricCard } from "@/components/ui/metric-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toPercent } from "@/lib/utils";

export default async function DashboardPage() {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const [{ data: jobs }, { data: tasks }, { data: users }, { data: taskAssignments }] = await Promise.all([
    supabase.from("jobs").select("id, status, due_date").eq("agency_id", profile.agency_id),
    supabase
      .from("tasks")
      .select("id, status, due_date, estimated_hours")
      .eq("agency_id", profile.agency_id),
    supabase
      .from("users")
      .select("id, name, weekly_capacity_hours")
      .eq("agency_id", profile.agency_id)
      .order("name", { ascending: true }),
    supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .eq("agency_id", profile.agency_id)
  ]);

  const today = new Date();

  const jobsAtivos = (jobs ?? []).filter((job) => job.status !== "finalizado").length;
  const jobsAtrasados = (jobs ?? []).filter((job) => {
    if (!job.due_date || job.status === "finalizado") return false;
    return new Date(job.due_date) < today;
  }).length;

  const tarefasEmAndamento = (tasks ?? []).filter((task) => task.status === "em_andamento").length;
  const tarefasAtrasadas = (tasks ?? []).filter((task) => {
    if (!task.due_date || task.status === "concluido") return false;
    return new Date(task.due_date) < today;
  }).length;

  const tasksById = new Map((tasks ?? []).map((task) => [task.id, task]));
  const assignmentsByUser = new Map<string, string[]>();

  for (const assignment of taskAssignments ?? []) {
    const current = assignmentsByUser.get(assignment.user_id) ?? [];
    current.push(assignment.task_id);
    assignmentsByUser.set(assignment.user_id, current);
  }

  const loadByUser = (users ?? []).map((user) => {
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

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Jobs ativos" value={jobsAtivos} subtitle="Em andamento" />
        <MetricCard title="Jobs atrasados" value={jobsAtrasados} subtitle="Prazo ultrapassado" />
        <MetricCard title="Tarefas em andamento" value={tarefasEmAndamento} subtitle="Execução atual" />
        <MetricCard title="Tarefas atrasadas" value={tarefasAtrasadas} subtitle="Pendentes com prazo vencido" />
      </section>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Carga da Equipe</h2>
          <p className="mt-1 text-sm text-muted">Distribuição da carga por estimativa de horas nas tarefas abertas.</p>
        </CardHeader>
        <CardContent>
          {loadByUser.length === 0 ? (
            <p className="text-sm text-muted">Nenhum membro encontrado.</p>
          ) : (
            <div className="space-y-4">
              {loadByUser.map((member) => (
                <div key={member.id} className="rounded-xl border border-border p-4">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <p className="font-medium">{member.name}</p>
                    <p className="text-muted">{member.percent}%</p>
                  </div>
                  <Progress value={member.percent} />
                  <p className="mt-2 text-xs text-muted">
                    {member.activeHours}h planejadas / {member.capacity}h de capacidade semanal
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
