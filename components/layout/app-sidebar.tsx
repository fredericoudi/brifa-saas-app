"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import iconeBrifa from "@/images/icone_brifa.svg";
import logoBrifa from "@/images/logo_brifa.svg";
import { AgencyMark } from "@/components/layout/agency-mark";
import { cn } from "@/lib/utils";
import { SidebarModeControl, type SidebarMode } from "@/components/layout/sidebar-mode-control";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

function SidebarNav({
  navItems,
  pathname,
  expanded,
  onNavigate
}: {
  navItems: NavItem[];
  pathname: string;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const activeHref =
    navItems
      .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "";

  return (
    <nav className="space-y-1.5 p-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === activeHref;

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={cn(
              "flex h-12 items-center rounded-[18px] text-base font-medium transition",
              expanded ? "gap-3 px-3.5" : "justify-center px-0",
              isActive
                ? "bg-brand text-white shadow-[0_16px_28px_-22px_hsl(var(--brand)/0.95)]"
                : "text-muted hover:bg-panelAlt/90 hover:text-text"
            )}
          >
            <Icon className="h-6 w-6" />
            {expanded ? <span className="truncate">{item.label}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppSidebar({
  navItems,
  pathname,
  agencyName,
  agencyLogoUrl,
  agencyUpdatedAt,
  mode,
  onModeChange,
  desktopExpanded,
  desktopWidth,
  onHoverStart,
  onHoverEnd,
  mobileOpen,
  onMobileClose
}: {
  navItems: NavItem[];
  pathname: string;
  agencyName: string;
  agencyLogoUrl: string | null;
  agencyUpdatedAt?: string;
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  desktopExpanded: boolean;
  desktopWidth: number;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}) {
  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onMobileClose}
          aria-label="Fechar navegação"
        />
      ) : null}

      <aside
        className={cn(
          "fixed bottom-3 left-3 top-3 z-50 w-[18rem] rounded-[30px] border border-border/80 bg-panel/95 shadow-panel backdrop-blur-xl transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <Link
            href="/dashboard"
            onClick={onMobileClose}
            className="flex items-center gap-3 border-b border-border/80 px-5 py-5"
          >
            <AgencyMark
              agencyName={agencyName}
              logoUrl={agencyLogoUrl}
              updatedAt={agencyUpdatedAt}
              className="h-12 w-12 rounded-2xl border border-border/80 bg-panelAlt shadow-soft"
              fallbackClassName="text-base font-semibold"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-text">{agencyName}</p>
              <p className="text-xs text-muted">Identidade da agência</p>
            </div>
          </Link>
          <SidebarNav navItems={navItems} pathname={pathname} expanded={true} onNavigate={onMobileClose} />
          <div className="mt-auto border-t border-border/80 p-3">
            <SidebarModeControl mode={mode} onChange={onModeChange} compact={false} />
          </div>
        </div>
      </aside>

      <aside
        className="fixed bottom-4 left-4 top-4 z-30 hidden overflow-hidden rounded-[32px] border border-border/80 bg-panel/92 shadow-panel backdrop-blur-xl transition-[width] duration-200 lg:flex lg:flex-col"
        style={{ width: desktopWidth }}
        onMouseEnter={mode === "hover" ? onHoverStart : undefined}
        onMouseLeave={mode === "hover" ? onHoverEnd : undefined}
      >
        <div className="border-b border-border/70 px-4 py-5">
          {desktopExpanded ? (
            <div className="flex h-[26px] items-center">
              <Image
                src={logoBrifa}
                alt="Brifa"
                priority
                className="h-auto w-[80px]"
              />
            </div>
          ) : (
            <div className="flex justify-center">
              <Image
                src={iconeBrifa}
                alt="Brifa"
                priority
                className="h-7 w-7"
              />
            </div>
          )}
        </div>

        <SidebarNav navItems={navItems} pathname={pathname} expanded={desktopExpanded} />
        <div className="mt-auto border-t border-border/80 p-3">
          <SidebarModeControl mode={mode} onChange={onModeChange} compact={!desktopExpanded} />
        </div>
      </aside>
    </>
  );
}
