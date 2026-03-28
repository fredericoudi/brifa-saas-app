import { NextResponse } from "next/server";
import type { UserProfile } from "@/lib/database.types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TaskRow = {
  id: string;
  title: string;
  status: "a_fazer" | "em_andamento" | "revisao" | "concluido";
};

export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient();
    const admin = createAdminSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, agency_id, name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const typedProfile = profile as Pick<UserProfile, "id" | "agency_id" | "name">;

    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id, title, agency_id")
      .eq("id", params.id)
      .eq("agency_id", typedProfile.agency_id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    const { data: tasksData, error: tasksError } = await admin
      .from("tasks")
      .select("id, title, status")
      .eq("agency_id", typedProfile.agency_id)
      .eq("job_id", params.id);

    if (tasksError) {
      return NextResponse.json({ error: tasksError.message }, { status: 400 });
    }

    const allTasks = ((tasksData as TaskRow[] | null) ?? []);
    const taskIds = allTasks.map((task) => task.id);

    if (taskIds.length === 0) {
      return NextResponse.json({ error: "Nenhuma tarefa vinculada a este job." }, { status: 400 });
    }

    const { data: assignmentsData, error: assignmentsError } = await admin
      .from("task_assignees")
      .select("task_id")
      .eq("agency_id", typedProfile.agency_id)
      .eq("user_id", typedProfile.id)
      .in("task_id", taskIds);

    if (assignmentsError) {
      return NextResponse.json({ error: assignmentsError.message }, { status: 400 });
    }

    const assignedTaskIds = [...new Set((assignmentsData ?? []).map((assignment) => assignment.task_id))];

    if (assignedTaskIds.length === 0) {
      return NextResponse.json({ error: "Você não possui participação ativa neste job." }, { status: 400 });
    }

    const assignedTasks = allTasks.filter((task) => assignedTaskIds.includes(task.id));
    const pendingTaskIds = assignedTasks.filter((task) => task.status !== "concluido").map((task) => task.id);

    if (pendingTaskIds.length > 0) {
      const { error: concludeError } = await admin
        .from("tasks")
        .update({ status: "concluido" })
        .in("id", pendingTaskIds)
        .eq("agency_id", typedProfile.agency_id)
        .eq("job_id", params.id);

      if (concludeError) {
        return NextResponse.json({ error: concludeError.message }, { status: 400 });
      }
    }

    const { error: deleteAssignmentsError } = await admin
      .from("task_assignees")
      .delete()
      .eq("agency_id", typedProfile.agency_id)
      .eq("user_id", typedProfile.id)
      .in("task_id", assignedTaskIds);

    if (deleteAssignmentsError) {
      return NextResponse.json({ error: deleteAssignmentsError.message }, { status: 400 });
    }

    const summary =
      assignedTasks.length === 1
        ? `encerrou a participação na tarefa "${assignedTasks[0]?.title ?? "Tarefa"}"`
        : `encerrou a participação em ${assignedTasks.length} tarefas`;

    const { error: eventError } = await admin.from("job_events").insert({
      job_id: params.id,
      user_id: typedProfile.id,
      event_type: "job_participation_finished",
      description: `${typedProfile.name} registrou saída do job e ${summary}.`
    });

    if (eventError) {
      console.error("Falha ao registrar evento de saída do job:", eventError.message);
    }

    return NextResponse.json({
      ok: true,
      removedAssignments: assignedTaskIds.length,
      concludedTasks: pendingTaskIds.length
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao registrar a saída do job." },
      { status: 500 }
    );
  }
}
