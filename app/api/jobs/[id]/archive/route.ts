import { NextResponse } from "next/server";
import type { Database, UserProfile } from "@/lib/database.types";
import { isMissingJobsArchivedAtColumn } from "@/lib/jobs-archive";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient();
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

    if (typedProfile.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem arquivar jobs." }, { status: 403 });
    }

    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select("id, title, archived_at")
      .eq("id", params.id)
      .eq("agency_id", typedProfile.agency_id)
      .maybeSingle();

    if (jobError) {
      if (isMissingJobsArchivedAtColumn(jobError.message)) {
        return NextResponse.json(
          { error: "O arquivamento de jobs ficará disponível após rodar a migration mais recente no Supabase." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: jobError.message }, { status: 400 });
    }

    if (!job) {
      return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
    }

    const typedJob = job as Pick<Database["public"]["Tables"]["jobs"]["Row"], "id" | "title" | "archived_at">;

    if (typedJob.archived_at) {
      return NextResponse.json({ archived: true });
    }

    const archivedAt = new Date().toISOString();
    const { error: updateError } = await (supabase.from("jobs") as never as {
      update: (payload: Pick<Database["public"]["Tables"]["jobs"]["Update"], "archived_at" | "archived_by">) => {
        eq: (
          column: "id",
          value: string
        ) => { eq: (column: "agency_id", value: string) => Promise<{ error: { message: string } | null }> };
      };
    })
      .update({
        archived_at: archivedAt,
        archived_by: typedProfile.id
      })
      .eq("id", params.id)
      .eq("agency_id", typedProfile.agency_id);

    if (updateError) {
      if (isMissingJobsArchivedAtColumn(updateError.message)) {
        return NextResponse.json(
          { error: "O arquivamento de jobs ficará disponível após rodar a migration mais recente no Supabase." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { error: eventError } = await (supabase.from("job_events") as never as {
      insert: (
        payload: Database["public"]["Tables"]["job_events"]["Insert"]
      ) => Promise<{ error: { message: string } | null }>;
    }).insert({
      job_id: params.id,
      user_id: typedProfile.id,
      event_type: "job_archived",
      description: `Job arquivado por ${typedProfile.name}.`
    });

    if (eventError) {
      console.error("Falha ao registrar evento de arquivamento do job:", eventError.message);
    }

    return NextResponse.json({ archived: true, archivedAt });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao arquivar job." },
      { status: 500 }
    );
  }
}
