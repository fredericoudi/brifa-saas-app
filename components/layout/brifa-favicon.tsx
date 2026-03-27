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
    const href = "/favicon-brifa.svg?v=1";

    upsertFaviconLink("icon", href);
    upsertFaviconLink("shortcut icon", href);
    upsertFaviconLink("apple-touch-icon", href);
  }, []);

  return null;
}
