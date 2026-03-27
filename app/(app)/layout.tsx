import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveAgencyPortalPath } from "@/lib/agency-routing";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (error || !agency) {
    redirect("/login?error=agency_not_found");
  }

  const agencyBlocked = agency.status === "inactive" || agency.status === "suspended";
  if (agencyBlocked && profile.platform_role !== "super_admin") {
    redirect(`/login?error=${agency.status === "suspended" ? "agency_suspended" : "agency_inactive"}`);
  }

  const signOutPath = resolveAgencyPortalPath(agency.slug) ?? "/";

  return (
    <AppShell
      profile={profile}
      agency={{
        name: agency.name,
        signOutPath,
        logoUrl: agency.logo_url ?? null,
        brandColor: agency.brand_color ?? null,
        updatedAt: agency.updated_at
      }}
    >
      {children}
    </AppShell>
  );
}
