"use client";

import Link from "next/link";
import { Menu, Plus } from "lucide-react";
import { AgencyMark } from "@/components/layout/agency-mark";
import { NotificationsMenu } from "@/components/layout/notifications-menu";
import { UserMenu } from "@/components/layout/user-menu";
import type { AgencyNotificationItem } from "@/lib/notifications";

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
  canCreateJob,
  newJobHref,
  notifications,
  notificationsReadStateKey,
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
  canCreateJob: boolean;
  newJobHref: string;
  notifications: AgencyNotificationItem[];
  notificationsReadStateKey: string;
  signingOut: boolean;
  onSignOut: () => Promise<void>;
  onMobileMenuToggle: () => void;
  desktopWidth: number;
}) {
  const topbarLeft = desktopWidth;

  return (
    <header
      className="fixed left-0 right-0 top-0 z-40 h-[84px] border-b border-border/80 bg-white lg:left-[var(--topbar-left)]"
      style={{ ["--topbar-left" as string]: `${topbarLeft}px` }}
    >
      <div className="flex h-full items-center justify-between gap-4 px-4 md:px-6 lg:px-7">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panelAlt/70 text-muted transition hover:bg-panelAlt hover:text-text lg:hidden"
            onClick={onMobileMenuToggle}
            aria-label="Abrir navegação"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 items-center gap-3 lg:gap-4">
            <AgencyMark
              agencyName={agencyName}
              logoUrl={agencyLogoUrl}
              updatedAt={agencyUpdatedAt}
              className="h-11 w-11 rounded-full border border-border/80 bg-panelAlt"
              fallbackClassName="text-sm font-semibold"
            />
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-sm font-semibold text-text">{agencyName}</p>
            </div>
            <div className="hidden h-8 w-px bg-border lg:block" />
            <div className="min-w-0">
              <p className="truncate text-[1.45rem] font-semibold tracking-tight text-text lg:text-[1.65rem]">
                {pageTitle}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 lg:gap-3">
          {canCreateJob ? (
            <Link
              href={newJobHref}
              className="hidden h-12 items-center justify-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-[0_18px_30px_-22px_hsl(var(--brand)/0.9)] transition hover:-translate-y-0.5 hover:brightness-[1.03] md:inline-flex"
            >
              <Plus className="h-4 w-4" />
              Novo Job
            </Link>
          ) : null}

          <NotificationsMenu
            notifications={notifications}
            readStateKey={notificationsReadStateKey}
          />

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
      </div>
    </header>
  );
}
