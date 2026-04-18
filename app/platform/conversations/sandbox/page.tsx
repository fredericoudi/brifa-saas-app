import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformConversationsSandboxPage() {
  await redirectLegacyPlatformRoute("/conversations/sandbox");
}
