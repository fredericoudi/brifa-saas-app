import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveAgencyAppPath, resolveAgencyPortalPath } from "@/lib/agency-routing";
import { requireAuth } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AgencyScopedProtectedLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { slug: string };
}) {
  const slug = params.slug.trim().toLowerCase();
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const { data: agency, error } = await supabase.from("agencies").select("*").eq("slug", slug).maybeSingle();

  if (error || !agency) {
    notFound();
  }

  if (profile.platform_role !== "super_admin" && profile.agency_id !== agency.id) {
    const { data: ownAgency } = await supabase.from("agencies").select("slug").eq("id", profile.agency_id).maybeSingle();
    redirect(resolveAgencyAppPath(ownAgency?.slug ?? null) ?? "/dashboard");
  }

  const agencyBlocked =
    agency.status === "inactive" || agency.status === "suspended" || agency.status === "pending_payment";
  const portalPath = resolveAgencyPortalPath(agency.slug) ?? `/app/${slug}`;

  if (agencyBlocked && profile.platform_role !== "super_admin") {
    const error =
      agency.status === "suspended"
        ? "agency_suspended"
        : agency.status === "pending_payment"
          ? "agency_payment_pending"
          : "agency_inactive";
    redirect(`${portalPath}?error=${error}`);
  }

  return (
    <AppShell
      profile={profile}
      agency={{
        name: agency.name,
        appBasePath: portalPath,
        signOutPath: portalPath,
        logoUrl: agency.logo_url ?? null,
        brandColor: agency.brand_color ?? null,
        updatedAt: agency.updated_at
      }}
    >
      {children}
    </AppShell>
  );
}
