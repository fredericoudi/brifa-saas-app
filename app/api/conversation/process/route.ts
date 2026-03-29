import { NextResponse } from "next/server";
import { z } from "zod";
import { isConversationProvider } from "@/services/conversation/providers";
import { processConversationInput } from "@/services/conversation/engine";

const bodySchema = z.object({
  provider: z.string().trim().optional(),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  message: z.string().trim().min(1, "Mensagem é obrigatória.").max(4000, "Mensagem muito longa."),
  externalContactId: z.string().trim().optional(),
  channelPhoneNumber: z.string().trim().optional(),
  externalAccountId: z.string().trim().optional(),
  externalMessageId: z.string().trim().optional(),
  timestamp: z.string().trim().optional(),
  profileName: z.string().trim().optional(),
  rawPayload: z.record(z.string(), z.unknown()).nullable().optional()
});

function isConversationProcessAuthorized(request: Request) {
  const configuredSecret = process.env.CONVERSATION_PROCESS_SECRET?.trim();

  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  const headerSecret =
    request.headers.get("x-conversation-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  return headerSecret === configuredSecret;
}

export async function POST(request: Request) {
  try {
    if (!isConversationProcessAuthorized(request)) {
      return NextResponse.json(
        { ok: false, error: "Acesso negado à rota de processamento conversacional." },
        { status: 401 }
      );
    }

    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: parsedBody.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      );
    }

    const provider = parsedBody.data.provider?.trim();
    const normalizedProvider = isConversationProvider(provider) ? provider : "internal_test";

    const result = await processConversationInput({
      provider: normalizedProvider,
      phone: parsedBody.data.phone,
      message: parsedBody.data.message,
      externalContactId: parsedBody.data.externalContactId,
      channelPhoneNumber: parsedBody.data.channelPhoneNumber,
      externalAccountId: parsedBody.data.externalAccountId,
      externalMessageId: parsedBody.data.externalMessageId,
      timestamp: parsedBody.data.timestamp,
      profileName: parsedBody.data.profileName,
      rawPayload: parsedBody.data.rawPayload ?? null
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao processar a mensagem."
      },
      { status: 500 }
    );
  }
}
