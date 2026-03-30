import { redirect } from "next/navigation";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminAliasPage() {
  await requireSuperAdmin();
  redirect(resolvePlatformPath());
}
