import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { RESERVED_AGENCY_SLUGS } from "@/lib/agency-routing";
import type { Database } from "@/lib/database.types";

type CookieMutation = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

const PUBLIC_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/ativar",
  "/api/agency-activation"
];

const PLATFORM_ROUTE_PREFIXES = ["/platform", "/master", "/master-panel", "/admin"];
function matchesRoutePrefix(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function isAgencySlugEntryPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length !== 1) return false;
  return !RESERVED_AGENCY_SLUGS.has(segments[0].toLowerCase());
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

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const isPublicRoute =
    PUBLIC_ROUTES.some((route) => matchesRoutePrefix(request.nextUrl.pathname, route)) ||
    isAgencySlugEntryPath(request.nextUrl.pathname);

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const isPlatformRoute = PLATFORM_ROUTE_PREFIXES.some((route) => matchesRoutePrefix(request.nextUrl.pathname, route));

  if (user && isPlatformRoute) {
    const { data: rawProfile } = await supabase
      .from("users")
      .select("platform_role")
      .eq("id", user.id)
      .maybeSingle();

    const profile = rawProfile as Pick<Database["public"]["Tables"]["users"]["Row"], "platform_role"> | null;

    if (profile?.platform_role !== "super_admin") {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.search = "";
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}
