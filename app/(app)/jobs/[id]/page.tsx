import { redirectLegacyAgencyRoute } from "@/features/agency-panel/server/legacy-route-redirect";

export default async function JobDetailsLegacyRoutePage({ params }: { params: { id: string } }) {
  await redirectLegacyAgencyRoute(`/jobs/${params.id}`);
}
