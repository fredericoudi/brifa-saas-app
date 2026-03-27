import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";

export default async function LegacyMasterAgencyPage({ params }: { params: { id: string } }) {
  await requireSuperAdmin();
  redirect(`/platform/agencies/${params.id}`);
}
