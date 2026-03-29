import { internalTestProvider } from "@/services/conversation/providers/internal-test";
import { metaCloudProvider } from "@/services/conversation/providers/meta-cloud";
import { twilioProvider } from "@/services/conversation/providers/twilio";
import type { ConversationProvider, WhatsAppProviderAdapter } from "@/services/conversation/providers/types";
import { zApiProvider } from "@/services/conversation/providers/zapi";

export const CONVERSATION_PROVIDER_LABEL: Record<ConversationProvider, string> = {
  meta_cloud: "Meta Cloud API",
  twilio: "Twilio",
  z_api: "Z-API",
  internal_test: "Teste interno"
};

const providers: Record<ConversationProvider, WhatsAppProviderAdapter> = {
  meta_cloud: metaCloudProvider,
  twilio: twilioProvider,
  z_api: zApiProvider,
  internal_test: internalTestProvider
};

export function isConversationProvider(value: string | null | undefined): value is ConversationProvider {
  return value === "meta_cloud" || value === "twilio" || value === "z_api" || value === "internal_test";
}

export function getConversationProviderAdapter(provider: ConversationProvider) {
  return providers[provider];
}
