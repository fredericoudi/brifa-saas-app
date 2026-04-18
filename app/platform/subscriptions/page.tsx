import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformSubscriptionsPage() {
  await redirectLegacyPlatformRoute("/subscriptions");
}
