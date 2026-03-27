const RESERVED_ROOT_SEGMENTS = [
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "auth",
  "ativar",
  "api",
  "dashboard",
  "jobs",
  "tasks",
  "clients",
  "team",
  "workload",
  "settings",
  "platform",
  "master",
  "master-panel",
  "admin"
] as const;

export const RESERVED_AGENCY_SLUGS = new Set<string>(RESERVED_ROOT_SEGMENTS);

export function isReservedAgencySlug(slug: string | null | undefined) {
  if (!slug) return true;
  return RESERVED_AGENCY_SLUGS.has(slug.trim().toLowerCase());
}

export function resolveAgencyPortalPath(slug: string | null | undefined) {
  const normalized = slug?.trim().toLowerCase() ?? "";
  if (!normalized || isReservedAgencySlug(normalized)) {
    return null;
  }

  return `/${normalized}`;
}
