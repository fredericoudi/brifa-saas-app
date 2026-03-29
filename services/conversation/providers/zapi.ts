import type { NormalizedInboundMessage, ReceiveMessageInput, SendTextMessageResult, WhatsAppProviderAdapter } from "@/services/conversation/providers/types";

async function receiveZApiMessage(_input: ReceiveMessageInput): Promise<NormalizedInboundMessage[]> {
  return [];
}

async function sendZApiTextMessage(): Promise<SendTextMessageResult> {
  return {
    ok: false,
    error: "O provider Z-API ainda não está implementado nesta etapa do BRIFA."
  };
}

export const zApiProvider: WhatsAppProviderAdapter = {
  provider: "z_api",
  receiveMessage: receiveZApiMessage,
  sendTextMessage: sendZApiTextMessage
};
