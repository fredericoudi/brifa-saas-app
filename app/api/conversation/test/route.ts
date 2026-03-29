import { NextResponse } from "next/server";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { executeConversationalAction } from "@/services/ai/actionExecutor";
import { parseUserMessage } from "@/services/ai/intentParser";
import { resolveUserByPhone } from "@/services/auth/resolveUserByPhone";

const bodySchema = z.object({
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  message: z.string().trim().min(1, "Mensagem é obrigatória.").max(4000, "Mensagem muito longa.")
});

async function getOrCreateConversation({
  agencyId,
  userId,
  phoneNumber
}: {
  agencyId: string;
  userId: string;
  phoneNumber: string;
}) {
  const admin = createAdminSupabaseClient();
  const { data: existingConversation, error: existingConversationError } = await admin
    .from("conversations")
    .select("id, agency_id, user_id, phone_number, channel")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .eq("phone_number", phoneNumber)
    .eq("channel", "internal_test")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingConversationError) {
    throw new Error(existingConversationError.message);
  }

  if (existingConversation) {
    return existingConversation;
  }

  const { data: createdConversation, error: createConversationError } = await admin
    .from("conversations")
    .insert({
      agency_id: agencyId,
      user_id: userId,
      phone_number: phoneNumber,
      channel: "internal_test"
    })
    .select("id, agency_id, user_id, phone_number, channel")
    .single();

  if (createConversationError || !createdConversation) {
    throw new Error(createConversationError?.message ?? "Falha ao criar conversa de teste.");
  }

  return createdConversation;
}

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

    const normalizedPhone = normalizePhoneNumber(parsedBody.data.phone);
    const resolvedUser = await resolveUserByPhone(parsedBody.data.phone);

    if (!resolvedUser.ok) {
      return NextResponse.json(
        {
          ok: false,
          intent: "UNKNOWN",
          response: resolvedUser.message
        },
        { status: 404 }
      );
    }

    const admin = createAdminSupabaseClient();
    const conversation = await getOrCreateConversation({
      agencyId: resolvedUser.user.agency_id,
      userId: resolvedUser.user.id,
      phoneNumber: resolvedUser.phoneNumber
    });

    const parsedMessage = await parseUserMessage(parsedBody.data.message, {
      agencyId: resolvedUser.user.agency_id,
      userId: resolvedUser.user.id,
      role: resolvedUser.user.role,
      agencyRole: resolvedUser.user.agency_role,
      phoneNumber: resolvedUser.phoneNumber
    });

    const { error: userMessageError } = await admin.from("messages").insert({
      conversation_id: conversation.id,
      agency_id: resolvedUser.user.agency_id,
      user_id: resolvedUser.user.id,
      sender_type: "user",
      content: parsedBody.data.message,
      intent: parsedMessage.intent,
      metadata: {
        confidence: parsedMessage.confidence,
        entities: parsedMessage.entities,
        phone_number: normalizedPhone
      } satisfies Database["public"]["Tables"]["messages"]["Insert"]["metadata"]
    });

    if (userMessageError) {
      throw new Error(userMessageError.message);
    }

    const actionResult = await executeConversationalAction({
      actor: resolvedUser.user,
      parsed: parsedMessage,
      conversationId: conversation.id,
      rawMessage: parsedBody.data.message
    });

    const { error: assistantMessageError } = await admin.from("messages").insert({
      conversation_id: conversation.id,
      agency_id: resolvedUser.user.agency_id,
      user_id: resolvedUser.user.id,
      sender_type: actionResult.ok ? "assistant" : "system",
      content: actionResult.response,
      intent: parsedMessage.intent,
      metadata: {
        ok: actionResult.ok,
        data: actionResult.data ?? null
      } satisfies Database["public"]["Tables"]["messages"]["Insert"]["metadata"]
    });

    if (assistantMessageError) {
      throw new Error(assistantMessageError.message);
    }

    const { error: touchConversationError } = await admin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    if (touchConversationError) {
      console.error("Falha ao atualizar updated_at da conversa de teste:", touchConversationError.message);
    }

    return NextResponse.json({
      ok: actionResult.ok,
      intent: parsedMessage.intent,
      confidence: parsedMessage.confidence,
      entities: parsedMessage.entities,
      response: actionResult.response,
      conversationId: conversation.id
    });
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
