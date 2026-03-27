import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function getCurrentContext() {
  const supabase = createServerSupabaseClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, profile: null } as { user: null; profile: null };
  }

  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    profile: profile ?? null
  } as { user: User; profile: UserProfile | null };
}

export async function requireAuth() {
  const context = await getCurrentContext();

  if (!context.user) {
    redirect("/login");
  }

  if (!context.profile) {
    redirect("/login?error=profile_not_found");
  }

  return context as { user: User; profile: UserProfile };
}

export async function requireSuperAdmin() {
  const context = await requireAuth();

  if (context.profile.platform_role !== "super_admin") {
    redirect("/dashboard");
  }

  return context as { user: User; profile: UserProfile & { platform_role: "super_admin" } };
}
