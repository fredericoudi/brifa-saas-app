import { redirect } from "next/navigation";
import { ConversationSandbox } from "@/components/conversations/sandbox/conversation-sandbox";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { requireSuperAdmin } from "@/lib/auth";
import { listConversationSandboxUsers } from "@/lib/conversation-sandbox";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export default async function PlatformConversationSandboxPage() {
  const { profile } = await requireSuperAdmin();

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
    redirect(resolvePlatformPath("/conversations"));
  }

  return (
    <ConversationSandbox
      agency={agencyResponse.data}
      users={users}
      canAccessAsSuperAdmin={true}
      backHref={resolvePlatformPath("/conversations")}
    />
  );
}
