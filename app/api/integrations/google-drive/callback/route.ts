import { NextRequest, NextResponse } from "next/server";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { exchangeGoogleAuthorizationCode } from "@/services/googleDriveService";

const OAUTH_STATE_COOKIE = "google_drive_oauth_state";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");
  const oauthError = requestUrl.searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL(`/settings?error=google_oauth_${encodeURIComponent(oauthError)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=google_oauth_missing_code", request.url));
  }

  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!expectedState || expectedState !== state) {
    return NextResponse.redirect(new URL("/settings?error=google_oauth_invalid_state", request.url));
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

  try {
    const origin = requestUrl.origin;
    const redirectUri = `${origin}/api/integrations/google-drive/callback`;
    const tokens = await exchangeGoogleAuthorizationCode({ code, redirectUri });

    const { data: existing } = await supabase
      .from("agency_integrations")
      .select("id, refresh_token, root_folder_id")
      .eq("agency_id", profile.agency_id)
      .eq("provider", "google_drive")
      .maybeSingle();

    const refreshToken = tokens.refreshToken ?? existing?.refresh_token ?? null;

    if (!refreshToken) {
      return NextResponse.redirect(new URL("/settings?error=google_refresh_token_missing", request.url));
    }

    const { error: upsertError } = await supabase.from("agency_integrations").upsert(
      {
        agency_id: profile.agency_id,
        provider: "google_drive",
        access_token: tokens.accessToken,
        refresh_token: refreshToken,
        root_folder_id: existing?.root_folder_id ?? null
      },
      { onConflict: "agency_id,provider" }
    );

    if (upsertError) {
      return NextResponse.redirect(
        new URL(`/settings?error=${encodeURIComponent(upsertError.message)}`, request.url)
      );
    }

    const response = NextResponse.redirect(new URL("/settings?success=google_drive_connected", request.url));
    response.cookies.set(OAUTH_STATE_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
      path: "/"
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_oauth_exchange_failed";
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(message)}`, request.url));
  }
}
