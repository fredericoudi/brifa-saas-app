export const DEFAULT_BRAND_HEX = "#335CFF";
export const AGENCY_BRAND_EVENT = "agency-brand-updated";

export type AgencyBrandEventDetail = {
  agencyName: string;
  logoUrl: string | null;
  brandColor: string | null;
  updatedAt?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeHexColor(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;

  const raw = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;

  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((char) => `${char}${char}`)
      .join("")
      .toUpperCase()}`;
  }

  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }

  return null;
}

function hexToRgb(hex: string) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;

  const numeric = Number.parseInt(normalized.slice(1), 16);

  return {
    r: (numeric >> 16) & 255,
    g: (numeric >> 8) & 255,
    b: numeric & 255
  };
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  const lightness = (max + min) / 2;

  if (delta !== 0) {
    if (max === red) {
      hue = ((green - blue) / delta) % 6;
    } else if (max === green) {
      hue = (blue - red) / delta + 2;
    } else {
      hue = (red - green) / delta + 4;
    }
  }

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return {
    h: Math.round(((hue * 60 + 360) % 360) * 10) / 10,
    s: Math.round(saturation * 1000) / 10,
    l: Math.round(lightness * 1000) / 10
  };
}

export function getAgencyBrandTheme(colorValue: string | null | undefined) {
  const hex = normalizeHexColor(colorValue) ?? DEFAULT_BRAND_HEX;
  const rgb = hexToRgb(hex);
  const base = rgb ? rgbToHsl(rgb) : { h: 256, s: 72, l: 44 };
  const mutedSaturation = clamp(Math.round(Math.max(base.s, 72)), 72, 96);

  return {
    hex,
    brandCss: `${Math.round(base.h)} ${Math.round(base.s)}% ${Math.round(base.l)}%`,
    brandMutedCss: `${Math.round(base.h)} ${mutedSaturation}% 95%`
  };
}

export function getAgencyBrandStyleVars(colorValue: string | null | undefined) {
  const theme = getAgencyBrandTheme(colorValue);

  return {
    "--brand": theme.brandCss,
    "--brand-muted": theme.brandMutedCss
  };
}

export function getAgencyLogoSrc(logoUrl: string | null | undefined, cacheKey?: string) {
  if (!logoUrl) return null;
  if (logoUrl.startsWith("blob:") || logoUrl.startsWith("data:")) return logoUrl;
  if (!cacheKey) return logoUrl;
  return `${logoUrl}${logoUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(cacheKey)}`;
}

export function getAgencyFallbackFavicon(agencyName: string) {
  const letter = agencyName.trim().charAt(0).toUpperCase() || "A";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="18" fill="${DEFAULT_BRAND_HEX}"/>
      <text x="32" y="40" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#ffffff">${letter}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
