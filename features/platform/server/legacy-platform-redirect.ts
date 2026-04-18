import { redirect } from "next/navigation";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { requireSuperAdmin } from "@/lib/auth";

export async function redirectLegacyPlatformRoute(path = "") {
  await requireSuperAdmin();
  redirect(resolvePlatformPath(path));
}
