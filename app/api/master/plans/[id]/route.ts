import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/master-server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const updatePlanSchema = z.object({
  priceMonthly: z.coerce.number().min(0).max(999999)
});

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const parsed = updatePlanSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Informe um valor mensal válido para o plano." }, { status: 400 });
    }

    const normalizedPriceMonthly = Number(parsed.data.priceMonthly.toFixed(2));
    const normalizedPriceCents = Math.round(normalizedPriceMonthly * 100);

    const admin = createAdminSupabaseClient();
    const { data: updatedPlan, error } = await admin
      .from("plans")
      .update({
        price_monthly: normalizedPriceMonthly,
        price_cents: normalizedPriceCents
      })
      .eq("id", params.id)
      .select("*")
      .single();

    if (error || !updatedPlan) {
      return NextResponse.json({ error: error?.message ?? "Não foi possível atualizar o plano." }, { status: 400 });
    }

    return NextResponse.json({ plan: updatedPlan });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao atualizar o plano." },
      { status: 500 }
    );
  }
}
