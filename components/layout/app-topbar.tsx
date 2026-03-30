"use client";

import { Menu } from "lucide-react";
import { AgencyMark } from "@/components/layout/agency-mark";
import { UserMenu } from "@/components/layout/user-menu";

export function AppTopbar({
  agencyName,
  agencyLogoUrl,
  agencyUpdatedAt,
  profileName,
  profileAvatarUrl,
  profileUpdatedAt,
  roleLabel,
  pageTitle,
  showMasterLink,
  masterHref,
  profileHref,
  agencyHref,
  signingOut,
  onSignOut,
  onMobileMenuToggle,
  desktopWidth
}: {
  agencyName: string;
  agencyLogoUrl: string | null;
  agencyUpdatedAt?: string;
  profileName: string;
  profileAvatarUrl: string | null;
  profileUpdatedAt?: string;
  roleLabel: string;
  pageTitle: string;
  showMasterLink: boolean;
  masterHref: string;
  profileHref: string;
  agencyHref: string;
  signingOut: boolean;
  onSignOut: () => Promise<void>;
  onMobileMenuToggle: () => void;
  desktopWidth: number;
}) {
  return (
    <header
      className="fixed left-3 right-3 top-3 z-40 h-[72px] rounded-[28px] border border-border/80 bg-panel/92 shadow-soft backdrop-blur-xl lg:left-[var(--topbar-left)] lg:right-4 lg:top-4"
      style={{ ["--topbar-left" as string]: `${desktopWidth + 32}px` }}
    >
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panelAlt/70 text-muted transition hover:bg-panelAlt hover:text-text lg:hidden"
            onClick={onMobileMenuToggle}
            aria-label="Abrir navegação"
          >
          <Menu className="h-4 w-4" />
          </button>

          <AgencyMark
            agencyName={agencyName}
            logoUrl={agencyLogoUrl}
            updatedAt={agencyUpdatedAt}
            className="h-11 w-11 rounded-2xl border border-border/80 bg-panelAlt"
            fallbackClassName="text-sm font-semibold"
          />

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text">{agencyName}</p>
            <p className="truncate text-xs text-muted">{profileName}</p>
          </div>

          <div className="hidden h-6 w-px bg-border lg:block" />
          <div className="hidden rounded-full border border-border bg-panelAlt/70 px-3 py-2 lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">{pageTitle}</p>
          </div>
        </div>

        <UserMenu
          profileName={profileName}
          profileAvatarUrl={profileAvatarUrl}
          profileUpdatedAt={profileUpdatedAt}
          roleLabel={roleLabel}
          showMasterLink={showMasterLink}
          masterHref={masterHref}
          profileHref={profileHref}
          agencyHref={agencyHref}
          signingOut={signingOut}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
}
