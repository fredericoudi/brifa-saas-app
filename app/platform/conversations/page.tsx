import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformConversationsPage() {
  await redirectLegacyPlatformRoute("/conversations");
}
