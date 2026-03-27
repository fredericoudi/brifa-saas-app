import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const GOOGLE_OAUTH_SCOPE = "https://www.googleapis.com/auth/drive";
const OAUTH_STATE_COOKIE = "google_drive_oauth_state";

export async function GET(request: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(new URL("/settings?error=missing_google_client_id", request.url));
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("agency_id, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile || profile.role !== "admin") {
    return NextResponse.redirect(new URL("/settings?error=google_drive_admin_only", request.url));
  }

  const commercialAccess = await assertAgencyActionAllowed({
    supabase,
    agencyId: profile.agency_id,
    action: "google_drive"
  });

  if (!commercialAccess.allowed) {
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(commercialAccess.message ?? "google_drive_plan_blocked")}`, request.url)
    );
  }

  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/integrations/google-drive/callback`;
  const state = randomUUID();

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_OAUTH_SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10,
    path: "/"
  });

  return response;
}
