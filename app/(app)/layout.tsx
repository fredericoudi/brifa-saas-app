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

  const agencyBlocked =
    agency.status === "inactive" || agency.status === "suspended" || agency.status === "pending_payment";
  if (agencyBlocked && profile.platform_role !== "super_admin") {
    const error =
      agency.status === "suspended"
        ? "agency_suspended"
        : agency.status === "pending_payment"
          ? "agency_payment_pending"
          : "agency_inactive";
    redirect(`/login?error=${error}`);
  }

  const signOutPath = resolveAgencyPortalPath(agency.slug) ?? "/";

  return (
    <AppShell
      profile={profile}
      agency={{
        name: agency.name,
        appBasePath: resolveAgencyPortalPath(agency.slug) ?? "",
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
