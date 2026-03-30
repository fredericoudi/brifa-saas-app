"use client";

import { usePathname, useRouter } from "next/navigation";
import { Archive, BarChart3, Briefcase, Building2, Kanban, LayoutDashboard, ListTodo, MessageSquareText, Settings, ShieldCheck, type LucideIcon, Users } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { resolvePlatformPath } from "@/lib/agency-routing";
import type { UserProfile } from "@/lib/database.types";
import { AGENCY_BRAND_EVENT, type AgencyBrandEventDetail, getAgencyBrandStyleVars } from "@/lib/agency-branding";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppTopbar } from "@/components/layout/app-topbar";
import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import type { SidebarMode } from "@/components/layout/sidebar-mode-control";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

type BaseNavItem = Omit<NavItem, "href"> & { path: string };

const baseNavItems: readonly BaseNavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/tasks", label: "Tarefas", icon: ListTodo },
  { path: "/jobs/kanban", label: "Kanban", icon: Kanban },
  { path: "/archived", label: "Arquivados", icon: Archive },
  { path: "/conversations", label: "Conversas", icon: MessageSquareText, adminOnly: true },
  { path: "/clients", label: "Clientes", icon: Building2 },
  { path: "/team", label: "Equipe", icon: Users },
  { path: "/workload", label: "Produção da Equipe", icon: BarChart3 },
  { path: "/settings", label: "Configurações", icon: Settings }
] as const;

const masterNavItem: NavItem = { href: resolvePlatformPath(), label: "Painel Master", icon: ShieldCheck };

const titleMap: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  kanban: "Kanban",
  tasks: "Tarefas",
  archived: "Arquivados",
  conversations: "Conversas",
  clients: "Clientes",
  team: "Equipe",
  workload: "Produção da Equipe",
  settings: "Configurações",
  platform: "Painel Master"
};

const SIDEBAR_MODE_STORAGE_KEY = "app.sidebar.mode";
const SIDEBAR_EXPANDED_WIDTH = 272;
const SIDEBAR_COLLAPSED_WIDTH = 76;

function isSidebarMode(value: string | null): value is SidebarMode {
  return value === "expanded" || value === "collapsed" || value === "hover";
}

export function AppShell({
  children,
  profile,
  agency
}: {
  children: React.ReactNode;
  profile: UserProfile;
  agency: {
    name: string;
    appBasePath: string;
    signOutPath: string;
    logoUrl: string | null;
    brandColor: string | null;
    updatedAt?: string;
  };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("expanded");
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [agencyState, setAgencyState] = useState(agency);

  const pageTitle = useMemo(() => {
    const normalizedPath = pathname.startsWith(agency.appBasePath)
      ? pathname.slice(agency.appBasePath.length) || "/"
      : pathname;
    const segment = normalizedPath.split("/").filter(Boolean)[0] ?? "dashboard";
    return titleMap[segment] ?? "Plataforma";
  }, [agency.appBasePath, pathname]);

  const navItems = useMemo(() => {
    const filteredItems = baseNavItems.filter(
      (item) => !item.adminOnly || profile.role === "admin" || profile.platform_role === "super_admin"
    ).map((item) => ({
      href: `${agency.appBasePath}${item.path}`,
      label: item.label,
      icon: item.icon
    }));

    if (profile.platform_role === "super_admin") {
      return [...filteredItems, masterNavItem];
    }

    return [...filteredItems];
  }, [agency.appBasePath, profile.platform_role, profile.role]);

  const desktopExpanded = sidebarMode === "expanded" || (sidebarMode === "hover" && hoverExpanded);
  const desktopWidth = desktopExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH;

  const roleLabel = profile.platform_role === "super_admin" ? "Super Admin" : profile.role === "admin" ? "Administrador" : "Membro";
  const brandStyle = useMemo(() => getAgencyBrandStyleVars(agencyState.brandColor) as CSSProperties, [agencyState.brandColor]);

  useEffect(() => {
    const storedMode = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY);
    if (isSidebarMode(storedMode)) {
      setSidebarMode(storedMode);
    }
  }, []);

  useEffect(() => {
    setAgencyState(agency);
  }, [agency]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, sidebarMode);
  }, [sidebarMode]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (sidebarMode !== "hover") {
      setHoverExpanded(false);
    }
  }, [sidebarMode]);

  useEffect(() => {
    const handleAgencyBrandUpdated = (event: Event) => {
      const detail = (event as CustomEvent<AgencyBrandEventDetail>).detail;
      if (!detail) return;

      setAgencyState((current) => ({
        name: detail.agencyName ?? current.name,
        appBasePath: current.appBasePath,
        signOutPath: current.signOutPath,
        logoUrl: detail.logoUrl ?? null,
        brandColor: detail.brandColor ?? null,
        updatedAt: detail.updatedAt ?? current.updatedAt
      }));
    };

    window.addEventListener(AGENCY_BRAND_EVENT, handleAgencyBrandUpdated as EventListener);

    return () => {
      window.removeEventListener(AGENCY_BRAND_EVENT, handleAgencyBrandUpdated as EventListener);
    };
  }, []);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.replace(agencyState.signOutPath);
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg bg-dashboard-pattern" style={brandStyle}>
      <BrifaFavicon />

      <AppTopbar
        agencyName={agencyState.name}
        agencyLogoUrl={agencyState.logoUrl}
        agencyUpdatedAt={agencyState.updatedAt}
        profileName={profile.name}
        profileAvatarUrl={profile.avatar_url ?? null}
        profileUpdatedAt={profile.updated_at}
        roleLabel={roleLabel}
        pageTitle={pageTitle}
        showMasterLink={profile.platform_role === "super_admin"}
        masterHref={resolvePlatformPath()}
        profileHref={`${agency.appBasePath}/settings#perfil`}
        agencyHref={`${agency.appBasePath}/settings#agencia`}
        signingOut={signingOut}
        onSignOut={handleSignOut}
        onMobileMenuToggle={() => setMobileOpen((prev) => !prev)}
        desktopWidth={desktopWidth}
      />

      <AppSidebar
        navItems={navItems}
        pathname={pathname}
        agencyName={agencyState.name}
        agencyLogoUrl={agencyState.logoUrl}
        agencyUpdatedAt={agencyState.updatedAt}
        mode={sidebarMode}
        onModeChange={setSidebarMode}
        dashboardHref={`${agency.appBasePath}/dashboard`}
        desktopExpanded={desktopExpanded}
        desktopWidth={desktopWidth}
        onHoverStart={() => setHoverExpanded(true)}
        onHoverEnd={() => setHoverExpanded(false)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main
        className="relative pt-[6.25rem] transition-[padding] duration-200 lg:pl-[var(--content-offset)]"
        style={{ ["--content-offset" as string]: `${desktopWidth + 32}px` } as CSSProperties}
      >
        <div className="w-full px-3 pb-4 md:px-4 md:pb-6">{children}</div>
      </main>
    </div>
  );
}
