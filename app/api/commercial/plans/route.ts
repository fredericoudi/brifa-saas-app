import { NextResponse } from "next/server";
import type { Plan } from "@/lib/database.types";
import {
  buildPublicSignupPlanOption,
  DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS,
  resolvePublicSignupPlanFromCommercialCode,
  type PublicSignupPlanOption
} from "@/lib/commercial-signup";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function isPublicPlanOption(value: PublicSignupPlanOption | null): value is PublicSignupPlanOption {
  return value != null;
}

export async function GET() {
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("plans")
      .select("code, name, price_cents")
      .in("code", ["starter", "pro", "agency"])
      .eq("active", true);

    if (error) {
      throw new Error(error.message);
    }

    const planMap = new Map<string, PublicSignupPlanOption>();

    for (const rawPlan of (data ?? []) as Pick<Plan, "code" | "name" | "price_cents">[]) {
      const slug = resolvePublicSignupPlanFromCommercialCode(rawPlan.code);
      if (!slug) continue;

      planMap.set(
        slug,
        buildPublicSignupPlanOption(slug, {
          label: rawPlan.name?.trim() || undefined,
          priceCents: rawPlan.price_cents
        })
      );
    }

    const orderedPlans = DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS.map((defaultPlan) => planMap.get(defaultPlan.slug) ?? null).filter(
      isPublicPlanOption
    );

    return NextResponse.json({
      plans: orderedPlans.length > 0 ? orderedPlans : DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS
    });
  } catch (error) {
    console.error("Falha ao carregar planos públicos para signup:", error);

    return NextResponse.json({
      plans: DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS
    });
  }
}
