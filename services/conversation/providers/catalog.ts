import type { ConversationProvider } from "@/services/conversation/providers/types";

export const CONVERSATION_PROVIDER_LABEL: Record<ConversationProvider, string> = {
  meta_cloud: "Meta Cloud API",
  twilio: "Twilio",
  z_api: "Z-API",
  internal_test: "Teste interno"
};

export function isConversationProvider(value: string | null | undefined): value is ConversationProvider {
  return value === "meta_cloud" || value === "twilio" || value === "z_api" || value === "internal_test";
}
