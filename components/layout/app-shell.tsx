"use client";

import { usePathname, useRouter } from "next/navigation";
import { Archive, BarChart3, Briefcase, Building2, Kanban, LayoutDashboard, ListTodo, MessageSquareText, Settings, ShieldCheck, type LucideIcon, Users } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
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

const baseNavItems: readonly NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/jobs", label: "Jobs", icon: Briefcase },
  { href: "/tasks", label: "Tarefas", icon: ListTodo },
  { href: "/jobs/kanban", label: "Kanban", icon: Kanban },
  { href: "/archived", label: "Arquivados", icon: Archive },
  { href: "/conversations", label: "Conversas", icon: MessageSquareText, adminOnly: true },
  { href: "/clients", label: "Clientes", icon: Building2 },
  { href: "/team", label: "Equipe", icon: Users },
  { href: "/workload", label: "Produção da Equipe", icon: BarChart3 },
  { href: "/settings", label: "Configurações", icon: Settings }
] as const;

const masterNavItem: NavItem = { href: "/platform", label: "Painel Master", icon: ShieldCheck };

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
    const segment = pathname.split("/").filter(Boolean)[0] ?? "dashboard";
    return titleMap[segment] ?? "Plataforma";
  }, [pathname]);

  const navItems = useMemo(() => {
    const filteredItems = baseNavItems.filter(
      (item) => !item.adminOnly || profile.role === "admin" || profile.platform_role === "super_admin"
    );

    if (profile.platform_role === "super_admin") {
      return [...filteredItems, masterNavItem];
    }

    return [...filteredItems];
  }, [profile.platform_role, profile.role]);

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
