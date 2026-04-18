import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function CalendarLegacyRoutePage() {
  await redirectLegacyAgencyRoute("/calendar");
}
