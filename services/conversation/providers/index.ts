export { CONVERSATION_PROVIDER_LABEL, isConversationProvider } from "@/services/conversation/providers/catalog";
import { internalTestProvider } from "@/services/conversation/providers/internal-test";
import { metaCloudProvider } from "@/services/conversation/providers/meta-cloud";
import { twilioProvider } from "@/services/conversation/providers/twilio";
import type { ConversationProvider, WhatsAppProviderAdapter } from "@/services/conversation/providers/types";
import { zApiProvider } from "@/services/conversation/providers/zapi";

const providers: Record<ConversationProvider, WhatsAppProviderAdapter> = {
  meta_cloud: metaCloudProvider,
  twilio: twilioProvider,
  z_api: zApiProvider,
  internal_test: internalTestProvider
};

export function getConversationProviderAdapter(provider: ConversationProvider) {
  return providers[provider];
}
