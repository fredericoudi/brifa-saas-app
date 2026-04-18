import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function ArchivedLegacyRoutePage() {
  await redirectLegacyAgencyRoute("/archived");
}
