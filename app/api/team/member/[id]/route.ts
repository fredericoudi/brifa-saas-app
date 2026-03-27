import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  context: {
    params: { id: string };
  }
) {
  try {
    const memberId = context.params.id;

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("users")
      .select("id, agency_id, role")
      .eq("id", user.id)
      .single();

    if (currentProfileError || !currentProfile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    if (currentProfile.role !== "admin") {
      return NextResponse.json({ error: "Apenas administradores podem remover membros." }, { status: 403 });
    }

    if (currentProfile.id === memberId) {
      return NextResponse.json({ error: "Não é permitido remover seu próprio usuário." }, { status: 400 });
    }

    const { data: targetMember, error: targetError } = await supabase
      .from("users")
      .select("id")
      .eq("id", memberId)
      .eq("agency_id", currentProfile.agency_id)
      .maybeSingle();

    if (targetError || !targetMember) {
      return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
    }

    const adminClient = createAdminSupabaseClient();
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(memberId, true);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Falha ao remover membro." }, { status: 500 });
  }
}
