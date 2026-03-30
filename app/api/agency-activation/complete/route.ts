import { NextResponse } from "next/server";
import { z } from "zod";
import { findAgencyActivation, findAgencyOnboardingActivation } from "@/lib/agency-activation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const activationSchema = z
  .object({
    agency: z.string().trim().min(1),
    token: z.string().trim().min(1).optional(),
    onboardingToken: z.string().trim().min(1).optional(),
    name: z.string().trim().min(2).max(120),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128)
  })
  .refine((data) => Boolean(data.token || data.onboardingToken), {
    path: ["token"],
    message: "Link de ativação inválido."
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "A confirmação de senha não confere."
  });

export async function POST(request: Request) {
  try {
    const parsed = activationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos para ativação da agência." },
        { status: 400 }
      );
    }

    const admin = createAdminSupabaseClient();
    const isOnboardingFlow = Boolean(parsed.data.onboardingToken);
    const activation = isOnboardingFlow
      ? await findAgencyOnboardingActivation(admin, parsed.data.agency, parsed.data.onboardingToken!)
      : await findAgencyActivation(admin, parsed.data.agency, parsed.data.token!);

    if (!activation.agency || (isOnboardingFlow ? !activation.onboardingToken : !activation.invitation)) {
      return NextResponse.json({ error: "Link de ativação inválido ou não encontrado." }, { status: 404 });
    }

    if (!isOnboardingFlow && activation.invitation?.status !== "pending") {
      return NextResponse.json({ error: "Esse link de ativação já foi utilizado ou cancelado." }, { status: 400 });
    }

    if (isOnboardingFlow && activation.onboardingToken?.used_at) {
      return NextResponse.json({ error: "Esse link de onboarding já foi utilizado." }, { status: 400 });
    }

    if (activation.expired) {
      if (!isOnboardingFlow && activation.invitation) {
        await admin
          .from("agency_invitations")
          .update({
            status: "expired",
            updated_at: new Date().toISOString()
          })
          .eq("id", activation.invitation.id);
      }

      return NextResponse.json({ error: "Esse link de ativação expirou. Solicite um novo link." }, { status: 400 });
    }

    if (isOnboardingFlow && activation.agency.status !== "active") {
      return NextResponse.json(
        { error: "A agência ainda não está liberada. Aguarde a confirmação do pagamento." },
        { status: 400 }
      );
    }

    const activationEmail = isOnboardingFlow ? activation.onboardingToken!.email : activation.invitation!.email;

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: activationEmail,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.data.name,
        invited_agency_id: activation.agency.id,
        invited_role: "admin",
        invited_agency_role: "Administrador"
      }
    });

    if (createUserError || !createdUser.user) {
      return NextResponse.json(
        { error: createUserError?.message ?? "Não foi possível criar o administrador da agência." },
        { status: 400 }
      );
    }

    const usedAt = new Date().toISOString();
    if (isOnboardingFlow) {
      await Promise.all([
        admin.from("onboarding_tokens").update({ used_at: usedAt }).eq("id", activation.onboardingToken!.id),
        admin
          .from("agencies")
          .update({
            owner_name: parsed.data.name,
            owner_email: activationEmail,
            activated_at: usedAt
          })
          .eq("id", activation.agency.id)
      ]);
    } else {
      await admin
        .from("agency_invitations")
        .update({
          status: "used",
          used_at: usedAt,
          updated_at: usedAt
        })
        .eq("id", activation.invitation!.id);
    }

    return NextResponse.json({
      success: true,
      email: activationEmail
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao ativar a agência." },
      { status: 500 }
    );
  }
}
