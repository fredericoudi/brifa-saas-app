import type { Database, Json } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { executeConversationalAction } from "@/services/ai/actionExecutor";
import { parseUserMessage } from "@/services/ai/intentParser";
import { resolveUserByPhone } from "@/services/auth/resolveUserByPhone";
import type { ConversationProvider } from "@/services/conversation/providers/types";
import {
  getOrCreateConversationThread,
  insertConversationAction,
  insertConversationMessage,
  resolveActiveAgencyChannel,
  touchConversationThread
} from "@/services/conversation/store";

const MIN_CONFIDENCE_TO_EXECUTE = 0.55;

type JsonValue = Database["public"]["Tables"]["conversation_messages"]["Insert"]["metadata"];

export type ProcessConversationInput = {
  provider: ConversationProvider;
  phone: string;
  message: string;
  externalContactId?: string | null;
  channelPhoneNumber?: string | null;
  externalAccountId?: string | null;
  externalMessageId?: string | null;
  timestamp?: string | null;
  profileName?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

export type ProcessConversationResult = {
  ok: boolean;
  response: string;
  threadId: string | null;
  agencyId: string | null;
  userId: string | null;
  channelId: string | null;
  provider: ConversationProvider;
  phoneNumber: string | null;
  replyToPhoneNumber: string | null;
  intent: string;
  confidence: number;
  entities: Record<string, unknown>;
};

function buildClarificationResponse() {
  return "Não entendi com segurança o que você quer fazer. Pode reformular a mensagem com mais detalhes?";
}

function serializeConversationMetadata(rawPayload: Record<string, unknown> | null | undefined): Json | null {
  if (!rawPayload) {
    return null;
  }

  return JSON.parse(JSON.stringify(rawPayload)) as Json;
}

export async function processConversationInput(input: ProcessConversationInput): Promise<ProcessConversationResult> {
  const normalizedPhone = normalizePhoneNumber(input.phone);
  const normalizedExternalContactId = normalizePhoneNumber(input.externalContactId) ?? normalizedPhone ?? input.phone;
  const channel = await resolveActiveAgencyChannel({
    provider: input.provider,
    externalAccountId: input.externalAccountId,
    channelPhoneNumber: input.channelPhoneNumber
  });

  if (input.provider !== "internal_test" && !channel) {
    return {
      ok: false,
      response: "Canal do WhatsApp não identificado ou inativo para esta agência.",
      threadId: null,
      agencyId: null,
      userId: null,
      channelId: null,
      provider: input.provider,
      phoneNumber: normalizedPhone,
      replyToPhoneNumber: normalizedPhone,
      intent: "UNKNOWN",
      confidence: 0,
      entities: {}
    };
  }

  const resolvedUser = await resolveUserByPhone(input.phone, {
    expectedAgencyId: channel?.agency_id ?? undefined
  });

  if (!resolvedUser.ok) {
    if (!channel) {
      return {
        ok: false,
        response: resolvedUser.message,
        threadId: null,
        agencyId: null,
        userId: null,
        channelId: null,
        provider: input.provider,
        phoneNumber: normalizedPhone,
        replyToPhoneNumber: normalizedPhone,
        intent: "UNKNOWN",
        confidence: 0,
        entities: {}
      };
    }

    const anonymousThread = await getOrCreateConversationThread({
      agencyId: channel.agency_id,
      userId: null,
      channelId: channel.id,
      externalContactId: normalizedExternalContactId,
      channel: input.provider
    });

    const inboundMetadata: JsonValue = {
      external_message_id: input.externalMessageId ?? null,
      provider: input.provider,
      profile_name: input.profileName ?? null,
      timestamp: input.timestamp ?? null,
      raw_payload: serializeConversationMetadata(input.rawPayload)
    };

    await insertConversationMessage({
      threadId: anonymousThread.id,
      agencyId: channel.agency_id,
      userId: null,
      senderType: "user",
      messageText: input.message,
      intent: "UNKNOWN",
      metadata: inboundMetadata
    });

    await insertConversationAction({
      agencyId: channel.agency_id,
      threadId: anonymousThread.id,
      userId: null,
      actionType: "USER_RESOLUTION",
      status: "blocked",
      payload: {
        phone_number: normalizedPhone,
        provider: input.provider
      },
      result: {
        message: resolvedUser.message
      }
    });

    await insertConversationMessage({
      threadId: anonymousThread.id,
      agencyId: channel.agency_id,
      userId: null,
      senderType: "system",
      messageText: resolvedUser.message,
      intent: "UNKNOWN",
      metadata: {
        reason: "user_resolution_failed"
      }
    });

    await touchConversationThread(anonymousThread.id);

    return {
      ok: false,
      response: resolvedUser.message,
      threadId: anonymousThread.id,
      agencyId: channel.agency_id,
      userId: null,
      channelId: channel.id,
      provider: input.provider,
      phoneNumber: normalizedPhone,
      replyToPhoneNumber: normalizedPhone,
      intent: "UNKNOWN",
      confidence: 0,
      entities: {}
    };
  }

  const thread = await getOrCreateConversationThread({
    agencyId: resolvedUser.user.agency_id,
    userId: resolvedUser.user.id,
    channelId: channel?.id ?? null,
    externalContactId: normalizedExternalContactId,
    channel: input.provider
  });

  const inboundMetadata: JsonValue = {
    external_message_id: input.externalMessageId ?? null,
    provider: input.provider,
    profile_name: input.profileName ?? null,
    timestamp: input.timestamp ?? null,
    raw_payload: serializeConversationMetadata(input.rawPayload)
  };

  await insertConversationMessage({
    threadId: thread.id,
    agencyId: resolvedUser.user.agency_id,
    userId: resolvedUser.user.id,
    senderType: "user",
    messageText: input.message,
    intent: null,
    metadata: inboundMetadata
  });

  const parsedMessage = await parseUserMessage(input.message, {
    agencyId: resolvedUser.user.agency_id,
    userId: resolvedUser.user.id,
    role: resolvedUser.user.role,
    agencyRole: resolvedUser.user.agency_role,
    phoneNumber: resolvedUser.phoneNumber,
    channel: input.provider,
    externalContactId: normalizedExternalContactId
  });

  if (parsedMessage.intent === "UNKNOWN" || parsedMessage.confidence < MIN_CONFIDENCE_TO_EXECUTE) {
    const clarificationResponse = buildClarificationResponse();

    await insertConversationAction({
      agencyId: resolvedUser.user.agency_id,
      threadId: thread.id,
      userId: resolvedUser.user.id,
      actionType: parsedMessage.intent,
      status: "clarification_required",
      payload: {
        message: input.message,
        confidence: parsedMessage.confidence,
        entities: parsedMessage.entities
      },
      result: {
        response: clarificationResponse
      }
    });

    await insertConversationMessage({
      threadId: thread.id,
      agencyId: resolvedUser.user.agency_id,
      userId: resolvedUser.user.id,
      senderType: "assistant",
      messageText: clarificationResponse,
      intent: parsedMessage.intent,
      metadata: {
        confidence: parsedMessage.confidence,
        entities: parsedMessage.entities,
        requires_clarification: true
      }
    });

    await touchConversationThread(thread.id);

    return {
      ok: false,
      response: clarificationResponse,
      threadId: thread.id,
      agencyId: resolvedUser.user.agency_id,
      userId: resolvedUser.user.id,
      channelId: channel?.id ?? null,
      provider: input.provider,
      phoneNumber: resolvedUser.phoneNumber,
      replyToPhoneNumber: resolvedUser.phoneNumber,
      intent: parsedMessage.intent,
      confidence: parsedMessage.confidence,
      entities: parsedMessage.entities
    };
  }

  const actionResult = await executeConversationalAction({
    actor: resolvedUser.user,
    parsed: parsedMessage,
    conversationId: null,
    rawMessage: input.message
  });

  await insertConversationAction({
    agencyId: resolvedUser.user.agency_id,
    threadId: thread.id,
    userId: resolvedUser.user.id,
    actionType: parsedMessage.intent,
    status: actionResult.ok ? "success" : "blocked",
    payload: {
      message: input.message,
      confidence: parsedMessage.confidence,
      entities: parsedMessage.entities,
      provider: input.provider
    },
    result: {
      response: actionResult.response,
      data: actionResult.data ?? null
    }
  });

  await insertConversationMessage({
    threadId: thread.id,
    agencyId: resolvedUser.user.agency_id,
    userId: resolvedUser.user.id,
    senderType: actionResult.ok ? "assistant" : "system",
    messageText: actionResult.response,
    intent: parsedMessage.intent,
    metadata: {
      ok: actionResult.ok,
      data: actionResult.data ?? null
    }
  });

  await touchConversationThread(thread.id);

  return {
    ok: actionResult.ok,
    response: actionResult.response,
    threadId: thread.id,
    agencyId: resolvedUser.user.agency_id,
    userId: resolvedUser.user.id,
    channelId: channel?.id ?? null,
    provider: input.provider,
    phoneNumber: resolvedUser.phoneNumber,
    replyToPhoneNumber: resolvedUser.phoneNumber,
    intent: parsedMessage.intent,
    confidence: parsedMessage.confidence,
    entities: parsedMessage.entities
  };
}
