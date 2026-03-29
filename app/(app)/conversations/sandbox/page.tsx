import { redirect } from "next/navigation";
import { ConversationSandbox } from "@/components/conversations/sandbox/conversation-sandbox";
import { requireAuth } from "@/lib/auth";
import { listConversationSandboxUsers } from "@/lib/conversation-sandbox";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export default async function ConversationSandboxPage() {
  const { profile } = await requireAuth();
  const canAccess = profile.role === "admin" || profile.platform_role === "super_admin";

  if (!canAccess) {
    redirect("/dashboard");
  }

  const admin = createAdminSupabaseClient();
  const [agencyResponse, users] = await Promise.all([
    admin
      .from("agencies")
      .select("id, name, slug, status")
      .eq("id", profile.agency_id)
      .maybeSingle(),
    listConversationSandboxUsers(profile.agency_id)
  ]);

  if (agencyResponse.error || !agencyResponse.data) {
    redirect("/conversations");
  }

  return (
    <ConversationSandbox
      agency={agencyResponse.data}
      users={users}
      canAccessAsSuperAdmin={profile.platform_role === "super_admin"}
    />
  );
}
