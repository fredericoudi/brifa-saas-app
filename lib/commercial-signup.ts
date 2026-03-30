import { randomBytes, randomUUID } from "crypto";
import { isReservedAgencySlug, resolveAgencyPortalPath } from "@/lib/agency-routing";
import { normalizeAgencySlug } from "@/lib/master";
import type { CommercialPlanCode } from "@/lib/commercial";

export const PUBLIC_SIGNUP_PLAN_SLUGS = ["start", "pro", "business"] as const;
export type PublicSignupPlanSlug = (typeof PUBLIC_SIGNUP_PLAN_SLUGS)[number];

export const PUBLIC_SIGNUP_PLAN_MAP: Record<PublicSignupPlanSlug, CommercialPlanCode> = {
  start: "starter",
  pro: "pro",
  business: "agency"
};

export const PUBLIC_SIGNUP_PLAN_LABEL: Record<PublicSignupPlanSlug, string> = {
  start: "Start",
  pro: "Pro",
  business: "Business"
};

export function isPublicSignupPlanSlug(value: string): value is PublicSignupPlanSlug {
  return PUBLIC_SIGNUP_PLAN_SLUGS.includes(value as PublicSignupPlanSlug);
}

export function normalizePublicSignupPlanSlug(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isPublicSignupPlanSlug(normalized) ? normalized : null;
}

export function resolveCommercialPlanCodeFromSignupPlan(plan: PublicSignupPlanSlug): CommercialPlanCode {
  return PUBLIC_SIGNUP_PLAN_MAP[plan];
}

export function normalizeSignupSlug(value: string) {
  const normalized = normalizeAgencySlug(value);
  return normalized;
}

export function validateCommercialSlug(value: string) {
  const normalized = normalizeSignupSlug(value);

  if (!normalized) {
    return { normalized: null, error: "Escolha um slug para o portal da agência." };
  }

  if (normalized.length < 3) {
    return { normalized: null, error: "O slug precisa ter pelo menos 3 caracteres." };
  }

  if (isReservedAgencySlug(normalized)) {
    return { normalized: null, error: "Esse slug é reservado. Escolha outro identificador para a agência." };
  }

  return { normalized, error: null };
}

export function generatePendingAgencyId() {
  return randomUUID();
}

export function generateOnboardingToken() {
  return randomBytes(32).toString("hex");
}

export function computeOnboardingExpiry(days = 7) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function buildOnboardingActivationPath(slug: string, token: string) {
  const params = new URLSearchParams({
    agency: slug,
    onboarding: token
  });

  return `/ativar?${params.toString()}`;
}

export function buildOnboardingActivationLink({
  origin,
  slug,
  token
}: {
  origin: string;
  slug: string;
  token: string;
}) {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${normalizedOrigin}${buildOnboardingActivationPath(slug, token)}`;
}

export function buildAgencyPortalLink(origin: string, slug: string) {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const portalPath = resolveAgencyPortalPath(slug) ?? `/app/${slug}`;
  return `${normalizedOrigin}${portalPath}`;
}
