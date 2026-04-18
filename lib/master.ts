import { randomBytes } from "crypto";
import type { AgencyInvitation, Database } from "@/lib/database.types";

export const AGENCY_STATUS_LABEL: Record<Database["public"]["Enums"]["agency_status"], string> = {
  active: "Ativa",
  inactive: "Inativa",
  suspended: "Suspensa",
  trial: "Trial",
  pending_payment: "Pagamento pendente"
};

export function normalizeAgencySlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAgencyActivationPath(slug: string, token: string) {
  const params = new URLSearchParams({
    agency: slug,
    token
  });

  return `/ativar?${params.toString()}`;
}

export function buildAgencyActivationLink({
  origin,
  slug,
  token
}: {
  origin: string;
  slug: string;
  token: string;
}) {
  const normalizedOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  return `${normalizedOrigin}${buildAgencyActivationPath(slug, token)}`;
}

export function generateActivationToken() {
  return randomBytes(24).toString("hex");
}

export function computeActivationExpiry(days = 14) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  return expiresAt.toISOString();
}

export function getPendingActivationInvitation(
  invitations: AgencyInvitation[] | null | undefined,
  agencyId: string
) {
  return (invitations ?? []).find(
    (invitation) => invitation.agency_id === agencyId && invitation.invitation_type === "agency_admin_activation"
  );
}
