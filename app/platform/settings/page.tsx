import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformSettingsPage() {
  await redirectLegacyPlatformRoute("/settings");
}
