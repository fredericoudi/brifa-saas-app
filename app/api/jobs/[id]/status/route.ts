import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgencyCommercialContext } from "@/lib/commercial";
import type { Database, Job, UserProfile } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { JOB_STATUS_LABEL } from "@/lib/utils";

const updateJobStatusSchema = z.object({
  status: z.enum(["briefing", "criacao", "revisao", "aprovado", "finalizado"])
});

async function handleStatusUpdate(request: Request, jobId: string) {
  try {
    const parsed = updateJobStatusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Status inválido para atualização do job." }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("id, agency_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const typedProfile = profile as Pick<UserProfile, "id" | "agency_id" | "role">;

    if (typedProfile.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem mover jobs no Kanban." }, { status: 403 });
    }

    const commercialContext = await getAgencyCommercialContext({
      supabase: supabase as unknown as Parameters<typeof getAgencyCommercialContext>[0]["supabase"],
      agencyId: typedProfile.agency_id
    });

    if (commercialContext.readOnlyMode) {
      return NextResponse.json(
        {
          error:
            commercialContext.permissions.create_job.message ??
            "Sua assinatura está em modo de visualização. Atualizações de status estão bloqueadas."
        },
        { status: 403 }
      );
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, status")
      .eq("id", jobId)
      .eq("agency_id", typedProfile.agency_id)
      .maybeSingle();

    if (jobError) {
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    const typedJob = job as Pick<Job, "id" | "status">;

    if (typedJob.status === parsed.data.status) {
      return NextResponse.json({ status: typedJob.status });
    }

    const { error: updateError } = await (supabase.from("jobs") as never as {
      update: (payload: Pick<Job, "status">) => {
        eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
      };
    })
      .update({ status: parsed.data.status })
      .eq("id", typedJob.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const description = `Status do job alterado de "${JOB_STATUS_LABEL[typedJob.status]}" para "${JOB_STATUS_LABEL[parsed.data.status]}".`;

    const { error: eventError } = await (supabase.from("job_events") as never as {
      insert: (
        payload: Database["public"]["Tables"]["job_events"]["Insert"]
      ) => Promise<{ error: { message: string } | null }>;
    }).insert({
      job_id: typedJob.id,
      user_id: typedProfile.id,
      event_type: "job_status_changed",
      description
    });

    if (eventError) {
      console.error("Falha ao registrar evento de status do job:", eventError.message);
    }

    return NextResponse.json({ status: parsed.data.status, description });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao atualizar status do job." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  return handleStatusUpdate(request, params.id);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  return handleStatusUpdate(request, params.id);
}
