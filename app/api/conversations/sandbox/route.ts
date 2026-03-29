import { NextResponse } from "next/server";
import { z } from "zod";
import type { SandboxDebugState, SandboxMessage } from "@/components/conversations/sandbox/types";
import {
  getConversationSandboxSnapshot,
  getConversationSandboxUser,
  requireConversationSandboxAccessApi
} from "@/lib/conversation-sandbox";
import { processConversationInput } from "@/services/conversation/engine";

const postBodySchema = z.object({
  userId: z.string().uuid("Usuário inválido."),
  message: z.string().trim().min(1, "Mensagem é obrigatória.").max(4000, "Mensagem muito longa.")
});

function buildDebugFromProcessResult(result: {
  ok: boolean;
  response: string;
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
}): SandboxDebugState {
  return {
    intent: result.intent,
    confidence: result.confidence,
    entities: result.entities,
    actionType: result.intent,
    status: result.ok ? "success" : "blocked",
    response: result.response,
    error: result.ok ? null : result.response,
    payload: null,
    result: null
  };
}

function buildEphemeralExchange(message: string, response: string): SandboxMessage[] {
  const timestamp = new Date().toISOString();

  return [
    {
      id: `ephemeral-user-${timestamp}`,
      sender_type: "user",
      message_text: message,
      intent: null,
      created_at: timestamp
    },
    {
      id: `ephemeral-system-${timestamp}`,
      sender_type: "system",
      message_text: response,
      intent: null,
      created_at: timestamp
    }
  ];
}

export async function GET(request: Request) {
  try {
    const auth = await requireConversationSandboxAccessApi();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const searchParams = new URL(request.url).searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Selecione um usuário para carregar o sandbox." }, { status: 400 });
    }

    const selectedUser = await getConversationSandboxUser({
      agencyId: auth.profile.agency_id,
      userId
    });

    if (!selectedUser) {
      return NextResponse.json({ error: "Usuário não encontrado nesta agência." }, { status: 404 });
    }

    const snapshot = await getConversationSandboxSnapshot({
      agencyId: auth.profile.agency_id,
      userId
    });

    return NextResponse.json({
      selectedUser,
      snapshot
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao carregar o sandbox conversacional."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireConversationSandboxAccessApi();
    if (auth.errorResponse || !auth.profile) {
      return auth.errorResponse!;
    }

    const parsedBody = postBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: parsedBody.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
    }

    const selectedUser = await getConversationSandboxUser({
      agencyId: auth.profile.agency_id,
      userId: parsedBody.data.userId
    });

    if (!selectedUser) {
      return NextResponse.json({ error: "Usuário não encontrado nesta agência." }, { status: 404 });
    }

    if (!selectedUser.phone_number) {
      const snapshot = await getConversationSandboxSnapshot({
        agencyId: auth.profile.agency_id,
        userId: parsedBody.data.userId
      });
      const responseMessage = "Esse usuário ainda não tem WhatsApp cadastrado. Preencha o telefone na Equipe para simular a conversa.";

      return NextResponse.json({
        ok: false,
        response: responseMessage,
        selectedUser,
        snapshot,
        debug: {
          intent: "UNKNOWN",
          confidence: null,
          entities: null,
          actionType: "USER_VALIDATION",
          status: "blocked",
          response: responseMessage,
          error: responseMessage,
          payload: null,
          result: null
        },
        ephemeralMessages: buildEphemeralExchange(parsedBody.data.message, responseMessage)
      });
    }

    const processResult = await processConversationInput({
      provider: "internal_test",
      phone: selectedUser.phone_number,
      message: parsedBody.data.message,
      profileName: selectedUser.name
    });

    const snapshot = await getConversationSandboxSnapshot({
      agencyId: auth.profile.agency_id,
      userId: parsedBody.data.userId
    });

    const shouldUseSnapshotDebug =
      Boolean(processResult.threadId) && snapshot.thread?.id === processResult.threadId && snapshot.debug;

    return NextResponse.json({
      ok: processResult.ok,
      response: processResult.response,
      selectedUser,
      snapshot,
      debug: shouldUseSnapshotDebug ? snapshot.debug : buildDebugFromProcessResult(processResult),
      ephemeralMessages: processResult.threadId ? [] : buildEphemeralExchange(parsedBody.data.message, processResult.response)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Falha ao processar o sandbox conversacional."
      },
      { status: 500 }
    );
  }
}
