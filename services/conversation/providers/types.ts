import type { AgencyChannel } from "@/lib/database.types";

export type ConversationProvider = "meta_cloud" | "twilio" | "z_api" | "internal_test";

export type NormalizedInboundMessage = {
  provider: ConversationProvider;
  fromPhoneNumber: string;
  text: string;
  externalContactId: string;
  channelPhoneNumber?: string | null;
  externalAccountId?: string | null;
  externalMessageId?: string | null;
  timestamp?: string | null;
  profileName?: string | null;
  rawPayload?: Record<string, unknown> | null;
};

export type SendTextMessageInput = {
  channel: AgencyChannel;
  to: string;
  text: string;
};

export type ReceiveMessageInput = {
  payload: unknown;
};

export type SendTextMessageResult = {
  ok: boolean;
  externalMessageId?: string | null;
  raw?: unknown;
  error?: string;
};

export interface WhatsAppProviderAdapter {
  readonly provider: ConversationProvider;
  receiveMessage?(input: ReceiveMessageInput): Promise<NormalizedInboundMessage[]>;
  sendTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult>;
}
