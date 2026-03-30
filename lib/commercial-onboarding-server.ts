import type { SupabaseClient } from "@supabase/supabase-js";
import { buildAgencyPortalLink, buildOnboardingActivationLink, computeOnboardingExpiry, generateOnboardingToken } from "@/lib/commercial-signup";
import type { Database, OnboardingToken, Plan } from "@/lib/database.types";
import { sendCommercialOnboardingEmail } from "@/services/email/commercial-onboarding";

export async function issueOnboardingToken({
  supabase,
  agencyId,
  email
}: {
  supabase: SupabaseClient<Database>;
  agencyId: string;
  email: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const now = Date.now();

  const { data: existing } = await supabase
    .from("onboarding_tokens")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("email", normalizedEmail)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const current = (existing as OnboardingToken | null) ?? null;

  if (current && new Date(current.expires_at).getTime() > now) {
    return current;
  }

  if (current) {
    await supabase.from("onboarding_tokens").update({ used_at: new Date(now).toISOString() }).eq("id", current.id);
  }

  const token = generateOnboardingToken();
  const expiresAt = computeOnboardingExpiry();
  const { data, error } = await supabase
    .from("onboarding_tokens")
    .insert({
      agency_id: agencyId,
      email: normalizedEmail,
      token,
      expires_at: expiresAt
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Não foi possível gerar o link inicial da agência.");
  }

  return data as OnboardingToken;
}

export async function sendAgencyAccessReadyEmail({
  agencyName,
  agencySlug,
  ownerName,
  ownerEmail,
  planName,
  onboardingToken,
  origin
}: {
  agencyName: string;
  agencySlug: string;
  ownerName: string;
  ownerEmail: string;
  planName: string;
  onboardingToken: string;
  origin: string | null;
}) {
  const baseOrigin = (origin ?? process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    ""
  );

  return sendCommercialOnboardingEmail({
    to: ownerEmail,
    ownerName,
    agencyName,
    planName,
    portalLink: buildAgencyPortalLink(baseOrigin, agencySlug),
    activationLink: buildOnboardingActivationLink({
      origin: baseOrigin,
      slug: agencySlug,
      token: onboardingToken
    })
  });
}

export function resolvePlanLabel(plan: Pick<Plan, "name"> | null) {
  return plan?.name ?? "BRIFA";
}
