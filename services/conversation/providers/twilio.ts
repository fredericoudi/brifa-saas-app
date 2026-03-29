import type { NormalizedInboundMessage, ReceiveMessageInput, SendTextMessageResult, WhatsAppProviderAdapter } from "@/services/conversation/providers/types";

async function receiveTwilioMessage(_input: ReceiveMessageInput): Promise<NormalizedInboundMessage[]> {
  return [];
}

async function sendTwilioTextMessage(): Promise<SendTextMessageResult> {
  return {
    ok: false,
    error: "O provider Twilio ainda não está implementado nesta etapa do BRIFA."
  };
}

export const twilioProvider: WhatsAppProviderAdapter = {
  provider: "twilio",
  receiveMessage: receiveTwilioMessage,
  sendTextMessage: sendTwilioTextMessage
};
