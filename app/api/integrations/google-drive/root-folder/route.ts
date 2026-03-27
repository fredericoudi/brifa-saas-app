import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getFolderLink, getFolderMetadata, refreshGoogleAccessToken } from "@/services/googleDriveService";

const bodySchema = z.object({
  rootFolderId: z.string().trim().max(256).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }

    const rootFolderId = parsed.data.rootFolderId?.trim() || null;

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("agency_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Apenas administradores podem configurar o Google Drive." }, { status: 403 });
    }

    const commercialAccess = await assertAgencyActionAllowed({
      supabase,
      agencyId: profile.agency_id,
      action: "google_drive"
    });

    if (!commercialAccess.allowed) {
      return NextResponse.json(
        { error: commercialAccess.message ?? "A integração com Google Drive está indisponível para a sua assinatura." },
        { status: 403 }
      );
    }

    const { data: integration, error: integrationError } = await supabase
      .from("agency_integrations")
      .select("id, refresh_token")
      .eq("agency_id", profile.agency_id)
      .eq("provider", "google_drive")
      .single();

    if (integrationError || !integration) {
      return NextResponse.json({ error: "Integração Google Drive não encontrada." }, { status: 404 });
    }

    if (!rootFolderId) {
      const { error: updateError } = await supabase
        .from("agency_integrations")
        .update({ root_folder_id: null })
        .eq("id", integration.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, rootFolderId: null });
    }

    const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
    const folder = await getFolderMetadata({
      accessToken: refreshed.accessToken,
      folderId: rootFolderId
    });

    const { error: updateError } = await supabase
      .from("agency_integrations")
      .update({
        access_token: refreshed.accessToken,
        refresh_token: refreshed.refreshToken ?? integration.refresh_token,
        root_folder_id: folder.id
      })
      .eq("id", integration.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      rootFolderId: folder.id,
      rootFolderName: folder.name,
      rootFolderUrl: folder.webViewLink ?? getFolderLink(folder.id)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao configurar pasta raiz do Google Drive." },
      { status: 500 }
    );
  }
}
