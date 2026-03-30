import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  RESERVED_AGENCY_SLUGS,
  resolveAgencyPortalPath,
  isCanonicalAgencyPath,
  prependAgencyAppPath,
  resolvePlatformLoginPath,
  resolvePlatformPath
} from "@/lib/agency-routing";
import type { Database } from "@/lib/database.types";

type CookieMutation = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/platform-login",
  "/app/platform-login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/ativar",
  "/api/agency-activation",
  "/api/commercial/signup",
  "/api/conversation/test",
  "/api/conversation/process",
  "/api/whatsapp/webhook",
  "/api/payments/asaas/webhook"
];

const PLATFORM_ROUTE_PREFIXES = ["/platform", "/app/platform", "/master", "/master-panel", "/admin"];
const LEGACY_PLATFORM_ROUTE_PREFIXES = ["/platform", "/master", "/master-panel", "/admin"];
const LEGACY_AGENCY_ROUTE_PREFIXES = [
  "/dashboard",
  "/jobs",
  "/tasks",
  "/archived",
  "/conversations",
  "/clients",
  "/team",
  "/workload",
  "/settings"
];
function matchesRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isAgencySlugEntryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return !RESERVED_AGENCY_SLUGS.has(segments[0].toLowerCase());
}

function isAgencyAppEntryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 2) return false;
  if (segments[0].toLowerCase() !== "app") return false;
  return !RESERVED_AGENCY_SLUGS.has(segments[1].toLowerCase());
}

function isAgencyAppPanelPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 3) return false;
  if (segments[0].toLowerCase() !== "app") return false;
  return !RESERVED_AGENCY_SLUGS.has(segments[1].toLowerCase());
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieMutation[]) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  if (request.nextUrl.pathname === "/platform-login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = resolvePlatformLoginPath();
    return NextResponse.redirect(redirectUrl);
  }

  if (isAgencySlugEntryPath(request.nextUrl.pathname)) {
    const slug = request.nextUrl.pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? null;
    const canonicalPortalPath = resolveAgencyPortalPath(slug);

    if (canonicalPortalPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = canonicalPortalPath;
      return NextResponse.redirect(redirectUrl);
    }
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isPlatformRoute = PLATFORM_ROUTE_PREFIXES.some((route) => matchesRoutePrefix(request.nextUrl.pathname, route));
  const isLegacyPlatformRoute = LEGACY_PLATFORM_ROUTE_PREFIXES.some((route) =>
    matchesRoutePrefix(request.nextUrl.pathname, route)
  );
  const isLegacyAgencyRoute = LEGACY_AGENCY_ROUTE_PREFIXES.some((route) =>
    matchesRoutePrefix(request.nextUrl.pathname, route)
  );

  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => matchesRoutePrefix(request.nextUrl.pathname, route)) ||
    isAgencyAppEntryPath(request.nextUrl.pathname);

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    if (isPlatformRoute) {
      redirectUrl.pathname = resolvePlatformLoginPath();
      const canonicalPlatformPath = isLegacyPlatformRoute
        ? resolvePlatformPath(request.nextUrl.pathname.replace(/^\/(platform|master|master-panel|admin)/, ""))
        : request.nextUrl.pathname;
      redirectUrl.searchParams.set("next", `${canonicalPlatformPath}${request.nextUrl.search}`);
    } else if (isAgencyAppPanelPath(request.nextUrl.pathname)) {
      const segments = request.nextUrl.pathname.split("/").filter(Boolean);
      redirectUrl.pathname = `/app/${segments[1]}`;
      redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    } else {
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    }
    return NextResponse.redirect(redirectUrl);
  }

  if (!user) {
    return response;
  }

  const shouldLoadProfile =
    isPlatformRoute ||
    isLegacyAgencyRoute ||
    isAgencyAppPanelPath(request.nextUrl.pathname) ||
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/platform-login" ||
    request.nextUrl.pathname === "/app/platform-login";

  if (!shouldLoadProfile) {
    return response;
  }

  const { data: rawProfile } = await supabase
    .from("users")
    .select("platform_role, agency_id")
    .eq("id", user.id)
    .maybeSingle();

  const profile = rawProfile as Pick<Database["public"]["Tables"]["users"]["Row"], "platform_role" | "agency_id"> | null;

  let agencySlug: string | null = null;
  if (profile?.agency_id) {
    const { data: agency } = await supabase.from("agencies").select("slug").eq("id", profile.agency_id).maybeSingle();
    agencySlug = agency?.slug?.toLowerCase() ?? null;
  }

  if (profile?.platform_role !== "super_admin" && isPlatformRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = agencySlug ? prependAgencyAppPath("/dashboard", agencySlug) : "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  if (profile?.platform_role === "super_admin" && isLegacyPlatformRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = resolvePlatformPath(request.nextUrl.pathname.replace(/^\/(platform|master|master-panel|admin)/, ""));
    return NextResponse.redirect(redirectUrl);
  }

  if (agencySlug && isLegacyAgencyRoute && !isCanonicalAgencyPath(request.nextUrl.pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = prependAgencyAppPath(request.nextUrl.pathname, agencySlug);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
