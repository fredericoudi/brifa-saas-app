import { redirect } from "next/navigation";
import { resolveAgencyAppPath, resolvePlatformPath } from "@/lib/agency-routing";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function redirectLegacyAgencyRoute(path = "/dashboard") {
  const { profile } = await requireAuth();

  if (profile.platform_role === "super_admin") {
    redirect(resolvePlatformPath());
  }

  if (!profile.agency_id) {
    redirect("/login?error=agency_not_found");
  }

  const supabase = createServerSupabaseClient();
  const { data: agency } = await supabase.from("agencies").select("slug").eq("id", profile.agency_id).maybeSingle();
  const resolvedPath = resolveAgencyAppPath(agency?.slug ?? null, path);

  redirect(resolvedPath ?? "/login?error=agency_not_found");
}
