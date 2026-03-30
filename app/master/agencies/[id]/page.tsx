import { redirect } from "next/navigation";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { requireSuperAdmin } from "@/lib/auth";

export default async function LegacyMasterAgencyPage({ params }: { params: { id: string } }) {
  await requireSuperAdmin();
  redirect(resolvePlatformPath(`/agencies/${params.id}`));
}
