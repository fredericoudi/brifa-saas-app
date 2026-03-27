import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgencyInvitation, Database } from "@/lib/database.types";

type ActivationLookup = {
  agency: Pick<Database["public"]["Tables"]["agencies"]["Row"], "id" | "name" | "slug" | "status"> | null;
  invitation: AgencyInvitation | null;
  expired: boolean;
};

export async function findAgencyActivation(
  supabase: SupabaseClient<Database>,
  slug: string,
  token: string
): Promise<ActivationLookup> {
  const { data: agency } = await supabase.from("agencies").select("id, name, slug, status").eq("slug", slug).maybeSingle();

  if (!agency) {
    return { agency: null, invitation: null, expired: false };
  }

  const { data: invitation } = await supabase
    .from("agency_invitations")
    .select("*")
    .eq("agency_id", agency.id)
    .eq("token", token)
    .eq("invitation_type", "agency_admin_activation")
    .maybeSingle();

  const expired = Boolean(
    invitation?.expires_at && new Date(invitation.expires_at).getTime() < Date.now() && invitation.status === "pending"
  );

  return {
    agency,
    invitation: invitation ?? null,
    expired
  };
}
