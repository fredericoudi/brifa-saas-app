const RESERVED_ROOT_SEGMENTS = [
  "app",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "platform-login",
  "auth",
  "ativar",
  "api",
  "dashboard",
  "jobs",
  "tasks",
  "archived",
  "conversations",
  "clients",
  "team",
  "workload",
  "settings",
  "platform",
  "plataform",
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

  return `/app/${normalized}`;
}

export function resolveAgencyAppPath(slug: string | null | undefined, path = "/dashboard") {
  const portalPath = resolveAgencyPortalPath(slug);
  if (!portalPath) {
    return null;
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return normalizedPath === "/" ? portalPath : `${portalPath}${normalizedPath}`;
}

export function resolvePlatformPath(path = "") {
  const normalizedPath = path
    ? path.startsWith("/")
      ? path
      : `/${path}`
    : "";

  return normalizedPath ? `/app/platform${normalizedPath}` : "/app/platform";
}

export function resolvePlatformLoginPath(next?: string | null) {
  const basePath = "/app/platform-login";

  if (!next) {
    return basePath;
  }

  const params = new URLSearchParams({ next });
  return `${basePath}?${params.toString()}`;
}

export function isCanonicalAgencyPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length >= 2 && segments[0]?.toLowerCase() === "app" && !isReservedAgencySlug(segments[1]);
}

export function extractAgencySlugFromPathname(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length >= 2 && segments[0]?.toLowerCase() === "app" && !isReservedAgencySlug(segments[1])) {
    return segments[1].toLowerCase();
  }

  if (segments.length >= 1 && !isReservedAgencySlug(segments[0])) {
    return segments[0].toLowerCase();
  }

  return null;
}

export function prependAgencyAppPath(pathname: string, slug: string) {
  const basePath = resolveAgencyPortalPath(slug);
  if (!basePath) {
    return pathname;
  }

  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized === "/") {
    return resolveAgencyAppPath(slug) ?? normalized;
  }

  return `${basePath}${normalized}`;
}

export function resolveAgencyPathFromCurrent(pathname: string, path = "/dashboard") {
  const slug = extractAgencySlugFromPathname(pathname);
  return resolveAgencyAppPath(slug, path) ?? path;
}

export function mapPlatformPathToCanonical(pathname: string) {
  if (pathname === "/platform") return resolvePlatformPath();
  if (pathname.startsWith("/platform/")) return resolvePlatformPath(pathname.replace(/^\/platform/, ""));
  if (pathname === "/platform-login") return resolvePlatformLoginPath();
  if (pathname.startsWith("/platform-login?")) return resolvePlatformLoginPath();
  if (pathname === "/master" || pathname === "/master-panel" || pathname === "/admin") {
    return resolvePlatformPath();
  }

  return pathname;
}
