"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LoadingBlock } from "@/components/ui/loading";
import { Progress } from "@/components/ui/progress";
import type { Task, UserProfile } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatDate, getDeadlineSignal, TASK_PRIORITY_LABEL, toPercent } from "@/lib/utils";

type OpenTask = Pick<Task, "id" | "title" | "priority" | "status" | "due_date" | "estimated_hours"> & {
  job: { title: string } | null;
};

type TaskAssignment = {
  task_id: string;
  user_id: string;
};

type MemberWorkload = {
  id: string;
  name: string;
  agencyRole: string;
  openTasks: number;
  onTrackTasks: number;
  nearDueTasks: number;
  overdueTasks: number;
  pendingHours: number;
  capacityHours: number;
  loadPercent: number;
  tasks: OpenTask[];
};

type FunctionWorkload = {
  functionName: string;
  openTasks: number;
  onTrackTasks: number;
  nearDueTasks: number;
  overdueTasks: number;
  pendingHours: number;
};

function buildDeadlineSummary(tasks: OpenTask[]) {
  return tasks.reduce(
    (acc, task) => {
      const signal = getDeadlineSignal({ dueDate: task.due_date, status: task.status });
      if (signal === "ok") acc.onTrack += 1;
      if (signal === "near") acc.near += 1;
      if (signal === "overdue") acc.overdue += 1;
      return acc;
    },
    { onTrack: 0, near: 0, overdue: 0 }
  );
}

export default function WorkloadPage() {
  const [members, setMembers] = useState<MemberWorkload[]>([]);
  const [functions, setFunctions] = useState<FunctionWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("agency_id")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setError("Perfil não encontrado.");
        return;
      }

      const [
        { data: usersData, error: usersError },
        { data: tasksData, error: tasksError },
        { data: assignmentsData, error: assignmentsError }
      ] = await Promise.all([
        supabase
          .from("users")
          .select("id, name, agency_role, weekly_capacity_hours")
          .eq("agency_id", profile.agency_id)
          .order("name", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, title, priority, status, due_date, estimated_hours, job:jobs(title)")
          .eq("agency_id", profile.agency_id)
          .neq("status", "concluido")
          .order("due_date", { ascending: true }),
        supabase
          .from("task_assignees")
          .select("task_id, user_id")
          .eq("agency_id", profile.agency_id)
      ]);

      if (usersError) throw usersError;
      if (tasksError) throw tasksError;
      if (assignmentsError) throw assignmentsError;

      const tasks = (tasksData ?? []) as OpenTask[];
      const assignments = (assignmentsData ?? []) as TaskAssignment[];
      const taskMap = new Map(tasks.map((task) => [task.id, task]));

      const assignmentsByUser = new Map<string, string[]>();
      for (const assignment of assignments) {
        const current = assignmentsByUser.get(assignment.user_id) ?? [];
        current.push(assignment.task_id);
        assignmentsByUser.set(assignment.user_id, current);
      }

      const memberWorkload = ((usersData ?? []) as Array<
        Pick<UserProfile, "id" | "name" | "agency_role" | "weekly_capacity_hours">
      >).map((member) => {
        const taskIds = [...new Set(assignmentsByUser.get(member.id) ?? [])];
        const memberTasks = taskIds.map((taskId) => taskMap.get(taskId)).filter((task): task is OpenTask => Boolean(task));
        const deadlines = buildDeadlineSummary(memberTasks);
        const openTasks = memberTasks.length;
        const pendingHours = memberTasks.reduce((sum, task) => sum + Number(task.estimated_hours ?? 0), 0);
        const capacityHours = Number(member.weekly_capacity_hours || 40);
        const loadPercent = toPercent(capacityHours > 0 ? (pendingHours / capacityHours) * 100 : 0);

        return {
          id: member.id,
          name: member.name,
          agencyRole: member.agency_role || "Outro",
          openTasks,
          onTrackTasks: deadlines.onTrack,
          nearDueTasks: deadlines.near,
          overdueTasks: deadlines.overdue,
          pendingHours,
          capacityHours,
          loadPercent,
          tasks: memberTasks
        };
      });

      const functionTaskIds = new Map<string, Set<string>>();
      for (const member of memberWorkload) {
        const functionName = member.agencyRole || "Outro";
        const current = functionTaskIds.get(functionName) ?? new Set<string>();

        for (const task of member.tasks) {
          current.add(task.id);
        }

        functionTaskIds.set(functionName, current);
      }

      const functionWorkload = [...functionTaskIds.entries()]
        .map(([functionName, taskIds]) => {
          const relatedTasks = [...taskIds].map((taskId) => taskMap.get(taskId)).filter((task): task is OpenTask => Boolean(task));
          const deadlines = buildDeadlineSummary(relatedTasks);
          const openTasks = relatedTasks.length;
          const pendingHours = relatedTasks.reduce((sum, task) => sum + Number(task.estimated_hours ?? 0), 0);

          return {
            functionName,
            openTasks,
            onTrackTasks: deadlines.onTrack,
            nearDueTasks: deadlines.near,
            overdueTasks: deadlines.overdue,
            pendingHours
          };
        })
        .sort((a, b) => b.openTasks - a.openTasks || a.functionName.localeCompare(b.functionName));

      setMembers(memberWorkload);
      setFunctions(functionWorkload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar produção da equipe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const totalOpenTasks = useMemo(
    () => functions.reduce((sum, item) => sum + item.openTasks, 0),
    [functions]
  );

  if (loading) return <LoadingBlock text="Carregando produção da equipe..." />;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Carga por pessoa</h2>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted">Nenhum membro encontrado para análise de carga.</p>
          ) : (
            <div className="space-y-4">
              {members.map((member) => (
                <div key={member.id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold">{member.name}</p>
                      <p className="text-sm text-muted">{member.agencyRole}</p>
                    </div>
                    <Badge variant={member.loadPercent >= 90 ? "danger" : member.loadPercent >= 70 ? "warning" : "success"}>
                      Carga: {member.loadPercent}%
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <p className="text-sm text-muted">{member.openTasks} tarefas abertas</p>
                    <p className="text-sm text-muted">{member.overdueTasks} tarefas atrasadas</p>
                    <p className="text-sm text-muted">{member.pendingHours}h pendentes</p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="success">{member.onTrackTasks} dentro do prazo</Badge>
                    <Badge variant="warning">{member.nearDueTasks} vencem hoje/amanhã</Badge>
                    <Badge variant="danger">{member.overdueTasks} atrasadas</Badge>
                  </div>

                  <div className="mt-3">
                    <Progress value={member.loadPercent} />
                    <p className="mt-1 text-xs text-muted">
                      {member.pendingHours}h planejadas / {member.capacityHours}h de capacidade semanal
                    </p>
                  </div>

                  {member.tasks.length > 0 ? (
                    <div className="mt-4 space-y-2">
                      {member.tasks.slice(0, 4).map((task) => {
                        const signal = getDeadlineSignal({ dueDate: task.due_date, status: task.status });
                        const signalBadge =
                          signal === "overdue"
                            ? { variant: "danger" as const, text: "Atrasada" }
                            : signal === "near"
                              ? { variant: "warning" as const, text: "Vence hoje/amanhã" }
                              : { variant: "success" as const, text: "No prazo" };

                        return (
                          <div key={task.id} className="rounded-lg border border-border/70 p-2">
                            <p className="text-sm font-medium">{task.title}</p>
                            <p className="text-xs text-muted">{task.job?.title ?? "Sem job"}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant={task.priority === "alta" ? "danger" : task.priority === "media" ? "warning" : "neutral"}>
                                {TASK_PRIORITY_LABEL[task.priority]}
                              </Badge>
                              <Badge variant="neutral">Prazo: {formatDate(task.due_date)}</Badge>
                              <Badge variant={signalBadge.variant}>{signalBadge.text}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Carga por função</h2>
          <p className="mt-1 text-sm text-muted">Total de tarefas abertas agrupadas por função da equipe.</p>
        </CardHeader>
        <CardContent>
          {functions.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma função com tarefas abertas no momento.</p>
          ) : (
            <div className="space-y-3">
              {functions.map((item) => (
                <div key={item.functionName} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item.functionName}</p>
                    <Badge variant="brand">{item.openTasks} tarefas abertas</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant="success">{item.onTrackTasks} dentro do prazo</Badge>
                    <Badge variant="warning">{item.nearDueTasks} vencem hoje/amanhã</Badge>
                    <Badge variant="danger">{item.overdueTasks} atrasadas</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{item.pendingHours}h pendentes</p>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-muted">Total consolidado: {totalOpenTasks} tarefas abertas.</p>
        </CardContent>
      </Card>
    </div>
  );
}
