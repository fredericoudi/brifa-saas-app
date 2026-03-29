import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeAgencyChannel } from "@/lib/conversation-admin";
import type { Database } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isConversationProvider } from "@/services/conversation/providers";

const bodySchema = z.object({
  channelId: z.string().uuid().optional(),
  provider: z.string().trim().min(1, "Provider é obrigatório."),
  phoneNumber: z.string().trim().min(1, "Número conectado é obrigatório."),
  externalAccountId: z.string().trim().optional(),
  accessToken: z.string().trim().optional(),
  refreshToken: z.string().trim().optional(),
  webhookVerifyToken: z.string().trim().optional(),
  isActive: z.boolean().default(false)
});

type AgencyAdminProfile = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "agency_id" | "role" | "platform_role"
>;

async function requireAgencyAdmin() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
      profile: null
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("id, agency_id, role, platform_role")
    .eq("id", user.id)
    .maybeSingle();

  const typedProfile = (profile as AgencyAdminProfile | null) ?? null;

  if (profileError || !typedProfile) {
    return {
      errorResponse: NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 }),
      profile: null
    };
  }

  if (typedProfile.role !== "admin" && typedProfile.platform_role !== "super_admin") {
    return {
      errorResponse: NextResponse.json({ error: "Apenas administradores podem configurar o WhatsApp." }, { status: 403 }),
      profile: null
    };
  }

  return { errorResponse: null, profile: typedProfile };
}

export async function GET() {
  try {
    const auth = await requireAgencyAdmin();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("agency_channels")
      .select("*")
      .eq("agency_id", auth.profile.agency_id)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      channel: sanitizeAgencyChannel((data as Database["public"]["Tables"]["agency_channels"]["Row"] | null) ?? null)
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar integração conversacional." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAgencyAdmin();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }

    if (!isConversationProvider(parsed.data.provider) || parsed.data.provider === "internal_test") {
      return NextResponse.json({ error: "Escolha um provider de WhatsApp válido para a agência." }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Informe o número conectado no formato 5511999999999." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const currentChannelId = parsed.data.channelId ?? null;

    const existingChannel = currentChannelId
      ? await admin
          .from("agency_channels")
          .select("*")
          .eq("id", currentChannelId)
          .eq("agency_id", auth.profile.agency_id)
          .maybeSingle()
      : { data: null, error: null };

    if (existingChannel.error) {
      return NextResponse.json({ error: existingChannel.error.message }, { status: 400 });
    }

    const current = (existingChannel.data as Database["public"]["Tables"]["agency_channels"]["Row"] | null) ?? null;
    const nextPayload: Database["public"]["Tables"]["agency_channels"]["Update"] = {
      provider: parsed.data.provider,
      phone_number: normalizedPhone,
      external_account_id: parsed.data.externalAccountId?.trim() || current?.external_account_id || null,
      access_token: parsed.data.accessToken?.trim() || current?.access_token || null,
      refresh_token: parsed.data.refreshToken?.trim() || current?.refresh_token || null,
      webhook_verify_token: parsed.data.webhookVerifyToken?.trim() || current?.webhook_verify_token || null,
      is_active: parsed.data.isActive
    };

    if (parsed.data.isActive) {
      const { error: deactivateError } = await admin
        .from("agency_channels")
        .update({ is_active: false })
        .eq("agency_id", auth.profile.agency_id)
        .neq("id", currentChannelId ?? "00000000-0000-0000-0000-000000000000");

      if (deactivateError) {
        return NextResponse.json({ error: deactivateError.message }, { status: 400 });
      }
    }

    const result = current
      ? await admin
          .from("agency_channels")
          .update(nextPayload)
          .eq("id", current.id)
          .eq("agency_id", auth.profile.agency_id)
          .select("*")
          .single()
      : await admin
          .from("agency_channels")
          .insert({
            agency_id: auth.profile.agency_id,
            provider: parsed.data.provider,
            phone_number: normalizedPhone,
            external_account_id: parsed.data.externalAccountId?.trim() || null,
            access_token: parsed.data.accessToken?.trim() || null,
            refresh_token: parsed.data.refreshToken?.trim() || null,
            webhook_verify_token: parsed.data.webhookVerifyToken?.trim() || null,
            is_active: parsed.data.isActive
          })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message ?? "Falha ao salvar a integração conversacional." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      channel: sanitizeAgencyChannel(result.data as Database["public"]["Tables"]["agency_channels"]["Row"])
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar integração conversacional." },
      { status: 500 }
    );
  }
}
