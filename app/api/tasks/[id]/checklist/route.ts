import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgencyCommercialContext } from "@/lib/commercial";
import type { UserProfile } from "@/lib/database.types";
import { getTaskChecklistProgress, normalizeTaskChecklistItems } from "@/lib/task-checklist";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const updateTaskChecklistSchema = z.object({
  items: z.unknown()
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const parsed = updateTaskChecklistSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido para atualizar o checklist." }, { status: 400 });
    }

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
      .select("id, agency_id, role, name")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const typedProfile = profile as Pick<UserProfile, "id" | "agency_id" | "role" | "name">;

    const commercialContext = await getAgencyCommercialContext({
      supabase: supabase as unknown as Parameters<typeof getAgencyCommercialContext>[0]["supabase"],
      agencyId: typedProfile.agency_id
    });

    if (commercialContext.readOnlyMode) {
      return NextResponse.json(
        {
          error:
            commercialContext.permissions.create_task.message ??
            "Sua assinatura está em modo de visualização. Atualizações de tarefa estão bloqueadas."
        },
        { status: 403 }
      );
    }

    const { data: task, error: taskError } = await admin
      .from("tasks")
      .select("id, agency_id, job_id, title")
      .eq("id", params.id)
      .eq("agency_id", typedProfile.agency_id)
      .maybeSingle();

    if (taskError) {
      return NextResponse.json({ error: taskError.message }, { status: 400 });
    }

    if (!task) {
      return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    }

    if (typedProfile.role !== "admin") {
      const { data: assignment, error: assignmentError } = await admin
        .from("task_assignees")
        .select("task_id")
        .eq("agency_id", typedProfile.agency_id)
        .eq("task_id", params.id)
        .eq("user_id", typedProfile.id)
        .maybeSingle();

      if (assignmentError) {
        return NextResponse.json({ error: assignmentError.message }, { status: 400 });
      }

      if (!assignment) {
        return NextResponse.json({ error: "Você não tem permissão para atualizar esta tarefa." }, { status: 403 });
      }
    }

    const checklistItems = normalizeTaskChecklistItems(parsed.data.items);

    const { error: updateError } = await admin
      .from("tasks")
      .update({ checklist_items: checklistItems })
      .eq("id", params.id)
      .eq("agency_id", typedProfile.agency_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const progress = getTaskChecklistProgress(checklistItems);

    const { error: eventError } = await admin.from("job_events").insert({
      job_id: task.job_id,
      user_id: typedProfile.id,
      event_type: "task_edited",
      description: `${typedProfile.name} atualizou o checklist da tarefa "${task.title}" para ${progress.percent}%.`
    });

    if (eventError) {
      console.error("Falha ao registrar evento de checklist da tarefa:", eventError.message);
    }

    return NextResponse.json({
      ok: true,
      items: checklistItems,
      progress
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar checklist da tarefa." },
      { status: 500 }
    );
  }
}
