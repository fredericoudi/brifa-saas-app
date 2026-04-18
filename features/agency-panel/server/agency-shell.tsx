import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { resolveAgencyAppPath, resolveAgencyPortalPath } from "@/lib/agency-routing";
import { requireAuth, resolveProfileHomePath } from "@/lib/auth";
import type { Agency, UserProfile } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AgencyShellAgency = Pick<Agency, "id" | "name" | "slug" | "status" | "logo_url" | "brand_color" | "updated_at">;

type AgencyShellContext = {
  profile: UserProfile;
  agency: AgencyShellAgency;
  portalPath: string;
};

function resolveAgencyBlockedError(status: Agency["status"]) {
  if (status === "suspended") return "agency_suspended";
  if (status === "pending_payment") return "agency_payment_pending";
  return "agency_inactive";
}

function buildAgencyShellContext(profile: UserProfile, agency: AgencyShellAgency): AgencyShellContext {
  return {
    profile,
    agency,
    portalPath: resolveAgencyPortalPath(agency.slug) ?? `/app/${agency.slug}`
  };
}

function renderAgencyShell(context: AgencyShellContext, children: React.ReactNode) {
  const { profile, agency, portalPath } = context;

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

export async function renderCurrentAgencyShell(children: React.ReactNode) {
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("id, name, slug, status, logo_url, brand_color, updated_at")
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (error || !agency) {
    redirect("/login?error=agency_not_found");
  }

  if (
    profile.platform_role !== "super_admin" &&
    (agency.status === "inactive" || agency.status === "suspended" || agency.status === "pending_payment")
  ) {
    redirect(`/login?error=${resolveAgencyBlockedError(agency.status)}`);
  }

  return renderAgencyShell(buildAgencyShellContext(profile, agency), children);
}

export async function renderAgencyShellBySlug(slug: string, children: React.ReactNode) {
  const normalizedSlug = slug.trim().toLowerCase();
  const { profile } = await requireAuth();
  const supabase = createServerSupabaseClient();

  const { data: agency, error } = await supabase
    .from("agencies")
    .select("id, name, slug, status, logo_url, brand_color, updated_at")
    .eq("slug", normalizedSlug)
    .maybeSingle();

  if (error || !agency) {
    notFound();
  }

  const context = buildAgencyShellContext(profile, agency);

  if (profile.platform_role !== "super_admin" && profile.agency_id !== agency.id) {
    redirect(await resolveProfileHomePath(profile));
  }

  if (
    profile.platform_role !== "super_admin" &&
    (agency.status === "inactive" || agency.status === "suspended" || agency.status === "pending_payment")
  ) {
    redirect(`${context.portalPath}?error=${resolveAgencyBlockedError(agency.status)}`);
  }

  return renderAgencyShell(context, children);
}

export async function resolveAgencyDashboardPathFromSlug(slug: string) {
  return resolveAgencyAppPath(slug, "/dashboard") ?? "/login?error=agency_not_found";
}
