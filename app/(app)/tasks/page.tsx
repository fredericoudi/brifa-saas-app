import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function TasksLegacyRoutePage() {
  await redirectLegacyAgencyRoute("/tasks");
}
