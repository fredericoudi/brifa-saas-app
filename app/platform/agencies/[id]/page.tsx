import { redirectLegacyPlatformRoute } from "@/features/platform/server/legacy-platform-redirect";

export default async function LegacyPlatformAgencyDetailsPage({ params }: { params: { id: string } }) {
  await redirectLegacyPlatformRoute(`/agencies/${params.id}`);
}
