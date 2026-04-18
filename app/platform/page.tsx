import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformDashboardPage() {
  await redirectLegacyPlatformRoute();
}
