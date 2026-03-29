import type { NormalizedInboundMessage, ReceiveMessageInput, SendTextMessageResult, WhatsAppProviderAdapter } from "@/services/conversation/providers/types";

async function receiveInternalTestMessage(_input: ReceiveMessageInput): Promise<NormalizedInboundMessage[]> {
  return [];
}

async function sendInternalTestMessage(): Promise<SendTextMessageResult> {
  return {
    ok: true,
    externalMessageId: null,
    raw: { provider: "internal_test" }
  };
}

export const internalTestProvider: WhatsAppProviderAdapter = {
  provider: "internal_test",
  receiveMessage: receiveInternalTestMessage,
  sendTextMessage: sendInternalTestMessage
};
