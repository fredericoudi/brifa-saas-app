import { NextResponse } from "next/server";
import { z } from "zod";
import { processConversationInput } from "@/services/conversation/engine";

const bodySchema = z.object({
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  message: z.string().trim().min(1, "Mensagem é obrigatória.").max(4000, "Mensagem muito longa.")
});

export async function POST(request: Request) {
  try {
    const testRouteEnabled =
      process.env.NODE_ENV !== "production" || process.env.CONVERSATION_TEST_ENABLED === "true";

    if (!testRouteEnabled) {
      return NextResponse.json(
        { ok: false, error: "A rota de teste conversacional está desabilitada neste ambiente." },
        { status: 403 }
      );
    }

    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { ok: false, error: parsedBody.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      );
    }

    const result = await processConversationInput({
      provider: "internal_test",
      phone: parsedBody.data.phone,
      message: parsedBody.data.message
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Falha ao processar conversa de teste."
      },
      { status: 500 }
    );
  }
}
