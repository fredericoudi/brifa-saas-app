import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function JobsLegacyRoutePage() {
  await redirectLegacyAgencyRoute("/jobs");
}
