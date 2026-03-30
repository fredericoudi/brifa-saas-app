import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/master-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const statusSchema = z.object({
  status: z.enum(["active", "inactive", "suspended", "trial", "pending_payment"])
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const parsed = statusSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Status operacional inválido." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const { data: agency, error } = await admin
      .from("agencies")
      .update({ status: parsed.data.status })
      .eq("id", params.id)
      .select("id, status")
      .single();

    if (error || !agency) {
      return NextResponse.json({ error: error?.message ?? "Não foi possível atualizar o status da agência." }, { status: 400 });
    }

    return NextResponse.json({ agency });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao atualizar a agência." },
      { status: 500 }
    );
  }
}
