"use client";

import { useEffect } from "react";
import { getAgencyFallbackFavicon, getAgencyLogoSrc } from "@/lib/agency-branding";

function upsertFaviconLink(rel: string, href: string) {
  let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
}

export function AgencyFavicon({
  agencyName,
  logoUrl,
  updatedAt
}: {
  agencyName: string;
  logoUrl: string | null;
  updatedAt?: string;
}) {
  useEffect(() => {
    const href = getAgencyLogoSrc(logoUrl, updatedAt) ?? getAgencyFallbackFavicon(agencyName);

    upsertFaviconLink("icon", href);
    upsertFaviconLink("shortcut icon", href);
    upsertFaviconLink("apple-touch-icon", href);
  }, [agencyName, logoUrl, updatedAt]);

  return null;
}
