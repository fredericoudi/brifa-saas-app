"use client";

import { useEffect, useState } from "react";
import { getAgencyLogoSrc } from "@/lib/agency-branding";
import { cn } from "@/lib/utils";

export function AgencyMark({
  agencyName,
  logoUrl,
  updatedAt,
  className,
  fallbackClassName,
  imageClassName
}: {
  agencyName: string;
  logoUrl: string | null;
  updatedAt?: string;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logoUrl, updatedAt]);

  const initial = agencyName.trim().charAt(0).toUpperCase() || "A";
  const resolvedLogoSrc = getAgencyLogoSrc(logoUrl, updatedAt);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-brand text-white",
        className
      )}
    >
      {resolvedLogoSrc && !imageFailed ? (
        <img
          src={resolvedLogoSrc}
          alt={`Logo da agência ${agencyName}`}
          className={cn("h-full w-full object-contain", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={cn("text-sm font-semibold", fallbackClassName)}>{initial}</span>
      )}
    </div>
  );
}
