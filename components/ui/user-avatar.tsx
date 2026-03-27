"use client";

import { useEffect, useMemo, useState } from "react";
import { cn, getInitials } from "@/lib/utils";

function resolveAvatarSrc(avatarUrl: string | null, updatedAt?: string) {
  if (!avatarUrl) return null;
  if (!updatedAt) return avatarUrl;

  const separator = avatarUrl.includes("?") ? "&" : "?";
  return `${avatarUrl}${separator}v=${encodeURIComponent(updatedAt)}`;
}

export function UserAvatar({
  name,
  avatarUrl,
  updatedAt,
  className,
  fallbackClassName,
  imageClassName
}: {
  name: string;
  avatarUrl: string | null;
  updatedAt?: string;
  className?: string;
  fallbackClassName?: string;
  imageClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [avatarUrl, updatedAt]);

  const resolvedAvatarSrc = useMemo(() => resolveAvatarSrc(avatarUrl, updatedAt), [avatarUrl, updatedAt]);

  return (
    <div
      className={cn(
        "flex items-center justify-center overflow-hidden rounded-full border border-border/70 bg-brandMuted text-brand shadow-[0_8px_18px_-16px_hsl(var(--brand)/0.8)]",
        className
      )}
    >
      {resolvedAvatarSrc && !imageFailed ? (
        <img
          src={resolvedAvatarSrc}
          alt={`Foto de perfil de ${name}`}
          className={cn("h-full w-full object-cover", imageClassName)}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", fallbackClassName)}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}
