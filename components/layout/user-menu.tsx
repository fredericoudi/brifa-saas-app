"use client";

import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { cn } from "@/lib/utils";

export function UserMenu({
  profileName,
  profileAvatarUrl,
  profileUpdatedAt,
  roleLabel,
  showMasterLink,
  masterHref,
  profileHref,
  agencyHref,
  signingOut,
  onSignOut
}: {
  profileName: string;
  profileAvatarUrl: string | null;
  profileUpdatedAt?: string;
  roleLabel: string;
  showMasterLink: boolean;
  masterHref: string;
  profileHref: string;
  agencyHref: string;
  signingOut: boolean;
  onSignOut: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-2 text-sm text-text transition hover:text-brand lg:gap-3"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Menu do usuário"
      >
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-semibold leading-none text-text">{profileName}</p>
          <p className="mt-1 truncate text-xs text-muted">{roleLabel}</p>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition", open ? "rotate-180" : "rotate-0")} />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-64 rounded-[24px] border border-border bg-panel p-2.5 shadow-panel">
          <div className="flex items-center gap-3 border-b border-border/80 px-3 pb-3">
            <UserAvatar
              name={profileName}
              avatarUrl={profileAvatarUrl}
              updatedAt={profileUpdatedAt}
              className="h-10 w-10 border-border/80 bg-brandMuted text-sm"
              fallbackClassName="text-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{profileName}</p>
              <p className="text-xs text-muted">{roleLabel}</p>
            </div>
          </div>

          <div className="pt-2.5">
            {showMasterLink ? (
              <Link
                href={masterHref}
                className="block rounded-[16px] px-3 py-2.5 text-sm transition hover:bg-panelAlt"
                onClick={() => setOpen(false)}
              >
                Painel Master
              </Link>
            ) : null}
            <Link
              href={profileHref}
              className="block rounded-[16px] px-3 py-2.5 text-sm transition hover:bg-panelAlt"
              onClick={() => setOpen(false)}
            >
              Meu perfil
            </Link>
            <Link
              href={agencyHref}
              className="block rounded-[16px] px-3 py-2.5 text-sm transition hover:bg-panelAlt"
              onClick={() => setOpen(false)}
            >
              Perfil da agência
            </Link>
            <button
              type="button"
              className="mt-1 inline-flex w-full items-center gap-2 rounded-[16px] px-3 py-2.5 text-left text-sm transition hover:bg-panelAlt"
              onClick={async () => {
                setOpen(false);
                await onSignOut();
              }}
              disabled={signingOut}
            >
              <LogOut className="h-4 w-4" />
              {signingOut ? "Saindo..." : "Sair"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
