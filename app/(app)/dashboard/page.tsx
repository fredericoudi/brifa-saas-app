import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function DashboardLegacyRoutePage() {
  await redirectLegacyAgencyRoute("/dashboard");
}
