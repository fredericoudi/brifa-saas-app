"use client";

import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import iconeBrifa from "@/images/icone_brifa.webp";
import logoBrifa from "@/images/logo_brifa.webp";
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
    <nav className={cn("space-y-1.5 py-6", expanded ? "px-4" : "px-2")}>
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
              "group relative flex h-[52px] items-center rounded-[18px] text-[15px] font-medium transition",
              expanded ? "gap-3 px-4" : "justify-center px-0",
              isActive
                ? "bg-brandMuted/45 text-brand"
                : "text-muted hover:bg-panelAlt/80 hover:text-text"
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-8 w-1 -translate-y-1/2 rounded-r-full transition",
                isActive ? "bg-brand" : "bg-transparent group-hover:bg-brand/20"
              )}
            />
            <Icon className="h-[18px] w-[18px]" />
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
          "fixed inset-y-0 left-0 z-50 w-[19.5rem] border-r border-border/80 bg-panel shadow-panel transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex h-full flex-col">
          <Link
            href={dashboardHref}
            onClick={onMobileClose}
            className="flex h-[84px] items-center gap-3 border-b border-border/80 px-6"
            aria-label={`Abrir dashboard de ${agencyName}`}
            title={agencyName}
          >
            <Image src={logoBrifa} alt="Brifa" priority className="h-auto w-[94px]" />
          </Link>
          <SidebarNav navItems={navItems} pathname={pathname} expanded={true} onNavigate={onMobileClose} />
          <div className="mt-auto border-t border-border/80 bg-panelAlt/55 p-3">
            <SidebarModeControl mode={mode} onChange={onModeChange} compact={false} />
          </div>
        </div>
      </aside>

      <aside
        className="fixed inset-y-0 left-0 z-30 hidden overflow-visible border-r border-border/80 bg-panel transition-[width] duration-200 lg:flex lg:flex-col"
        style={{ width: desktopWidth }}
        onMouseEnter={mode === "hover" ? onHoverStart : undefined}
        onMouseLeave={mode === "hover" ? onHoverEnd : undefined}
      >
        <div className={cn("flex h-[84px] border-b border-border/80 px-5", desktopExpanded ? "items-center" : "items-center justify-center")}>
          {desktopExpanded ? (
            <Image src={logoBrifa} alt="Brifa" priority className="h-auto w-[94px]" />
          ) : (
            <Image src={iconeBrifa} alt="Brifa" priority className="h-8 w-8" />
          )}
        </div>

        <SidebarNav navItems={navItems} pathname={pathname} expanded={desktopExpanded} />
        <div className="mt-auto border-t border-border/80 bg-panelAlt/55 p-3">
          <SidebarModeControl mode={mode} onChange={onModeChange} compact={!desktopExpanded} />
        </div>
      </aside>
    </>
  );
}
