import { NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeConversationChannel } from "@/lib/conversation-admin";
import type { Database } from "@/lib/database.types";
import { requireSuperAdminApi } from "@/lib/master-server";
import { normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
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

type PlatformChannelRow = Database["public"]["Tables"]["platform_channels"]["Row"];

function isMissingPlatformChannelsTableError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("platform_channels") && (normalized.includes("does not exist") || normalized.includes("relation"));
}

export async function GET() {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("platform_channels")
      .select("*")
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingPlatformChannelsTableError(error.message)) {
        return NextResponse.json(
          { error: "A tabela platform_channels ainda não foi criada. Execute a migration antes de configurar o canal global." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      channel: sanitizeConversationChannel((data as PlatformChannelRow | null) ?? null, "platform")
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao carregar integração conversacional da plataforma." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }

    if (!isConversationProvider(parsed.data.provider) || parsed.data.provider === "internal_test") {
      return NextResponse.json({ error: "Escolha um provider de WhatsApp válido para a plataforma." }, { status: 400 });
    }

    const normalizedPhone = normalizePhoneNumber(parsed.data.phoneNumber);
    if (!normalizedPhone) {
      return NextResponse.json({ error: "Informe o número conectado no formato 5511999999999." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    const existingChannel = parsed.data.channelId
      ? await admin
          .from("platform_channels")
          .select("*")
          .eq("id", parsed.data.channelId)
          .maybeSingle()
      : await admin
          .from("platform_channels")
          .select("*")
          .eq("provider", parsed.data.provider)
          .maybeSingle();

    if (existingChannel.error) {
      if (isMissingPlatformChannelsTableError(existingChannel.error.message)) {
        return NextResponse.json(
          { error: "A tabela platform_channels ainda não foi criada. Execute a migration antes de configurar o canal global." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: existingChannel.error.message }, { status: 400 });
    }

    const current = (existingChannel.data as PlatformChannelRow | null) ?? null;
    const nextPayload: Database["public"]["Tables"]["platform_channels"]["Update"] = {
      provider: parsed.data.provider,
      phone_number: normalizedPhone,
      external_account_id: parsed.data.externalAccountId?.trim() || current?.external_account_id || null,
      access_token: parsed.data.accessToken?.trim() || current?.access_token || null,
      refresh_token: parsed.data.refreshToken?.trim() || current?.refresh_token || null,
      webhook_verify_token: parsed.data.webhookVerifyToken?.trim() || current?.webhook_verify_token || null,
      is_active: parsed.data.isActive
    };

    if (parsed.data.isActive) {
      const { error: deactivateError } = await admin.from("platform_channels").update({ is_active: false }).neq("id", current?.id ?? "");
      if (deactivateError) {
        return NextResponse.json({ error: deactivateError.message }, { status: 400 });
      }
    }

    const result = current
      ? await admin.from("platform_channels").update(nextPayload).eq("id", current.id).select("*").single()
      : await admin
          .from("platform_channels")
          .insert({
            provider: parsed.data.provider,
            phone_number: normalizedPhone,
            external_account_id: parsed.data.externalAccountId?.trim() || null,
            access_token: parsed.data.accessToken?.trim() || null,
            refresh_token: parsed.data.refreshToken?.trim() || null,
            webhook_verify_token: parsed.data.webhookVerifyToken?.trim() || null,
            is_active: parsed.data.isActive,
            created_by: auth.profile.id
          })
          .select("*")
          .single();

    if (result.error || !result.data) {
      return NextResponse.json(
        { error: result.error?.message ?? "Falha ao salvar integração conversacional da plataforma." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      channel: sanitizeConversationChannel(result.data as PlatformChannelRow, "platform")
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao salvar integração conversacional da plataforma." },
      { status: 500 }
    );
  }
}
