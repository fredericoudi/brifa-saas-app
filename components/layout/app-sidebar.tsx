"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import iconeBrifa from "@/images/icone_brifa.webp";
import logoBrifa from "@/images/logo_brifa.webp";
import { cn } from "@/lib/utils";
import { SidebarModeControl, type SidebarMode } from "@/components/layout/sidebar-mode-control";

const ACTIVE_SIDEBAR_ICON_FILTER =
  "brightness(0) saturate(100%) invert(33%) sepia(95%) saturate(2682%) hue-rotate(226deg) brightness(99%) contrast(95%)";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  iconSrc?: string;
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
  const [failedIcons, setFailedIcons] = useState<Record<string, boolean>>({});

  return (
    <nav className="space-y-0 py-6">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = item.href === activeHref;
        const useFallbackIcon = failedIcons[item.href] || !item.iconSrc;

        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            onClick={onNavigate}
            className={cn(
              "group relative flex h-[56px] items-center rounded-none text-[16.5px] font-medium transition-colors duration-200",
              expanded ? "gap-3.5 px-8" : "justify-center px-0",
              isActive
                ? "bg-[#FBFAFA] text-brand"
                : "text-muted hover:bg-[#FBFAFA] hover:text-text"
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-0 h-full w-[5px] rounded-r-[8px] transition",
                isActive ? "bg-brand" : "bg-transparent"
              )}
            />
            {!useFallbackIcon ? (
              <img
                src={item.iconSrc}
                alt=""
                width={20}
                height={20}
                className="h-5 w-5 object-contain transition duration-200"
                style={isActive ? { filter: ACTIVE_SIDEBAR_ICON_FILTER } : undefined}
                onError={() => {
                  setFailedIcons((previous) => ({ ...previous, [item.href]: true }));
                }}
              />
            ) : (
              <Icon className="h-5 w-5" />
            )}
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
  dashboardHref,
  agencyName,
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
  dashboardHref: string;
  agencyName: string;
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
          "fixed inset-y-0 left-0 z-50 w-[18.4rem] bg-panel shadow-[6px_0_20px_-14px_rgba(15,23,42,0.26)] transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <Link
            href={dashboardHref}
            onClick={onMobileClose}
            className="flex h-[84px] items-center gap-3 border-b border-border/80 px-[26px]"
            aria-label={`Abrir dashboard de ${agencyName}`}
            title={agencyName}
          >
            <Image src={logoBrifa} alt="Brifa" priority className="h-auto w-[94px]" />
          </Link>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <SidebarNav navItems={navItems} pathname={pathname} expanded={true} onNavigate={onMobileClose} />
          </div>
          <div className="mt-auto bg-panelAlt/55 px-0 py-[13px]">
            <SidebarModeControl mode={mode} onChange={onModeChange} compact={false} />
          </div>
        </div>
      </aside>

      <aside
        className="fixed inset-y-0 left-0 z-30 hidden overflow-visible bg-panel shadow-[6px_0_20px_-14px_rgba(15,23,42,0.26)] transition-[width] duration-200 lg:flex lg:flex-col"
        style={{ width: desktopWidth }}
        onMouseEnter={mode === "hover" ? onHoverStart : undefined}
        onMouseLeave={mode === "hover" ? onHoverEnd : undefined}
      >
        <div
          className={cn(
            "flex h-[84px] border-b border-border/80 px-[22px]",
            desktopExpanded ? "items-center" : "items-center justify-center"
          )}
        >
          {desktopExpanded ? (
            <Image src={logoBrifa} alt="Brifa" priority className="h-auto w-[94px]" />
          ) : (
            <Image src={iconeBrifa} alt="Brifa" priority className="h-8 w-8" />
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <SidebarNav navItems={navItems} pathname={pathname} expanded={desktopExpanded} />
        </div>
        <div className="mt-auto bg-panelAlt/55 px-0 py-[13px]">
          <SidebarModeControl mode={mode} onChange={onModeChange} compact={!desktopExpanded} />
        </div>
      </aside>
    </>
  );
}
