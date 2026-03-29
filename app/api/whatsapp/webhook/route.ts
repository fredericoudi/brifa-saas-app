import { NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { processConversationInput } from "@/services/conversation/engine";
import { getConversationProviderAdapter, isConversationProvider } from "@/services/conversation/providers";
import { matchesMetaVerifyToken, validateMetaWebhookSignature } from "@/services/conversation/providers/meta-cloud";
import { insertConversationAction, resolveActiveAgencyChannel } from "@/services/conversation/store";

async function resolveMetaVerifyChannel(verifyToken: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("agency_channels")
    .select("*")
    .eq("provider", "meta_cloud")
    .eq("is_active", true)
    .eq("webhook_verify_token", verifyToken)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data && matchesMetaVerifyToken(data, verifyToken) ? data : null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");
    const mode = searchParams.get("hub.mode");
    const challenge = searchParams.get("hub.challenge");
    const verifyToken = searchParams.get("hub.verify_token");

    if (provider && provider !== "meta_cloud") {
      return new NextResponse("Validação GET disponível apenas para Meta Cloud API nesta etapa.", { status: 400 });
    }

    if (mode !== "subscribe" || !challenge || !verifyToken) {
      return new NextResponse("Parâmetros inválidos.", { status: 400 });
    }

    const channel = await resolveMetaVerifyChannel(verifyToken);

    if (!channel) {
      return new NextResponse("Token de verificação inválido.", { status: 403 });
    }

    return new NextResponse(challenge, { status: 200 });
  } catch (error) {
    return new NextResponse(
      error instanceof Error ? error.message : "Falha ao verificar o webhook do WhatsApp.",
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const requestedProvider = searchParams.get("provider");
    const provider = isConversationProvider(requestedProvider) ? requestedProvider : "meta_cloud";

    const rawBody = await request.text();
    const signatureHeader = request.headers.get("x-hub-signature-256");

    if (provider !== "meta_cloud") {
      return NextResponse.json(
        { ok: false, error: `O provider ${provider} ainda não está implementado para recebimento real de webhook.` },
        { status: 400 }
      );
    }

    const isValidSignature = validateMetaWebhookSignature({ rawBody, signatureHeader, appSecret: process.env.WHATSAPP_META_APP_SECRET });

    if (!isValidSignature) {
      return NextResponse.json({ ok: false, error: "Assinatura inválida do webhook." }, { status: 401 });
    }

    const payload = JSON.parse(rawBody) as unknown;
    const providerAdapter = getConversationProviderAdapter(provider);
    const inboundMessages = providerAdapter.receiveMessage
      ? await providerAdapter.receiveMessage({ payload })
      : [];

    for (const inbound of inboundMessages) {
      const channel = await resolveActiveAgencyChannel({
        provider,
        externalAccountId: inbound.externalAccountId,
        channelPhoneNumber: inbound.channelPhoneNumber
      });

      const result = await processConversationInput({
        provider,
        phone: inbound.fromPhoneNumber,
        message: inbound.text,
        externalContactId: inbound.externalContactId,
        channelPhoneNumber: inbound.channelPhoneNumber,
        externalAccountId: inbound.externalAccountId,
        externalMessageId: inbound.externalMessageId,
        timestamp: inbound.timestamp,
        profileName: inbound.profileName,
        rawPayload: inbound.rawPayload ?? null
      });

      if (!channel || !result.replyToPhoneNumber || !result.response.trim()) {
        continue;
      }

      const outboundProvider = getConversationProviderAdapter(provider);
      const sendResult = await outboundProvider.sendTextMessage({
        channel,
        to: result.replyToPhoneNumber,
        text: result.response
      });

      await insertConversationAction({
        agencyId: channel.agency_id,
        threadId: result.threadId,
        userId: result.userId,
        actionType: "SEND_WHATSAPP_RESPONSE",
        status: sendResult.ok ? "success" : "error",
        payload: {
          to: result.replyToPhoneNumber,
          provider,
          inbound_message_id: inbound.externalMessageId ?? null
        },
        result: {
          error: sendResult.error ?? null,
          external_message_id: sendResult.externalMessageId ?? null
        }
      });
    }

    return NextResponse.json({ ok: true, processed: inboundMessages.length }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao processar o webhook do WhatsApp."
      },
      { status: 500 }
    );
  }
}
