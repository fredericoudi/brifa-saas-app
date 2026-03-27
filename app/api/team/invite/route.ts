import { NextResponse } from "next/server";
import { z } from "zod";
import { AGENCY_ROLE_OPTIONS } from "@/lib/agency-roles";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.string().trim().min(1, "E-mail é obrigatório.").email("E-mail inválido."),
  agencyRole: z
    .string()
    .trim()
    .min(1, "Função é obrigatória.")
    .refine((value) => AGENCY_ROLE_OPTIONS.includes(value as (typeof AGENCY_ROLE_OPTIONS)[number]), {
      message: "Função inválida."
    }),
  role: z.enum(["admin", "member"]).default("member")
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = inviteSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Dados inválidos.";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const name = parsed.data.name.trim();
    const email = parsed.data.email.trim().toLowerCase();
    const agencyRole = parsed.data.agencyRole;
    const role = parsed.data.role;

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

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Apenas administradores podem convidar membros." }, { status: 403 });
    }

    const commercialAccess = await assertAgencyActionAllowed({
      supabase,
      agencyId: profile.agency_id,
      action: "invite_user"
    });

    if (!commercialAccess.allowed) {
      return NextResponse.json(
        { error: commercialAccess.message ?? "O convite de usuários está indisponível para sua assinatura." },
        { status: 403 }
      );
    }

    const { data: existingMember } = await supabase
      .from("users")
      .select("id")
      .eq("agency_id", profile.agency_id)
      .eq("email", email)
      .maybeSingle();

    if (existingMember) {
      return NextResponse.json({ error: "Este e-mail já faz parte da equipe." }, { status: 409 });
    }

    const adminClient = createAdminSupabaseClient();

    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        invited_agency_id: profile.agency_id,
        invited_role: role,
        invited_agency_role: agencyRole,
        full_name: name
      },
      redirectTo: `${new URL(request.url).origin}/auth/callback?next=/dashboard`
    });

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 });
    }

    const { error: invitationError } = await supabase.from("team_invitations").upsert(
      {
        agency_id: profile.agency_id,
        name,
        email,
        role,
        agency_role: agencyRole,
        invited_by: profile.id,
        accepted_at: null
      },
      { onConflict: "agency_id,email" }
    );

    if (invitationError) {
      return NextResponse.json({ error: invitationError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Falha ao enviar convite." }, { status: 500 });
  }
}
