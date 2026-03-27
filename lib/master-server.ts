import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type { UserProfile } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function requireSuperAdminApi() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
      user: null,
      profile: null
    };
  }

  const { data: rawProfile, error } = await supabase
    .from("users")
    .select("id, agency_id, role, platform_role, name, email")
    .eq("id", user.id)
    .maybeSingle();

  const profile = rawProfile as Pick<UserProfile, "id" | "agency_id" | "role" | "platform_role" | "name" | "email"> | null;

  if (error || !profile) {
    return {
      errorResponse: NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 }),
      user: null,
      profile: null
    };
  }

  if (profile.platform_role !== "super_admin") {
    return {
      errorResponse: NextResponse.json({ error: "Acesso restrito ao super admin." }, { status: 403 }),
      user,
      profile
    };
  }

  return {
    errorResponse: null,
    user,
    profile
  };
}

export function getRequestOrigin() {
  const requestHeaders = headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";

  if (!host) {
    return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  }

  return `${protocol}://${host}`;
}
