"use client";

import { useEffect } from "react";

function upsertFaviconLink(rel: string, href: string) {
  let link = document.head.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }

  link.href = href;
}

export function BrifaFavicon() {
  useEffect(() => {
    const iconHref = "/icon.svg?v=3";
    const appleHref = "/apple-icon.svg?v=3";

    upsertFaviconLink("icon", iconHref);
    upsertFaviconLink("shortcut icon", iconHref);
    upsertFaviconLink("apple-touch-icon", appleHref);
  }, []);

  return null;
}
