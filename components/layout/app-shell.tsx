"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  BarChart3,
  Briefcase,
  Building2,
  Kanban,
  LayoutDashboard,
  ListTodo,
  MessageSquareText,
  Settings,
  ShieldCheck,
  type LucideIcon,
  Users
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { resolvePlatformPath } from "@/lib/agency-routing";
import type { AgencyCommercialContext } from "@/lib/commercial";
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
  { path: "/clients", label: "Clientes", icon: Building2 },
  { path: "/team", label: "Equipe", icon: Users },
  { path: "/workload", label: "Produção da Equipe", icon: BarChart3 },
  { path: "/conversations", label: "Conversas", icon: MessageSquareText, adminOnly: true },
  { path: "/settings", label: "Configurações", icon: Settings }
] as const;

const masterNavItem: NavItem = { href: resolvePlatformPath(), label: "Painel Master", icon: ShieldCheck };

const titleMap: Record<string, string> = {
  dashboard: "Dashboard",
  jobs: "Jobs",
  kanban: "Kanban",
  tasks: "Tarefas",
  archived: "Arquivados",
  clients: "Clientes",
  team: "Equipe",
  workload: "Produção da Equipe",
  conversations: "Conversas",
  settings: "Configurações",
  platform: "Painel Master"
};

const SIDEBAR_MODE_STORAGE_KEY = "app.sidebar.mode";
const SIDEBAR_EXPANDED_WIDTH = 236;
const SIDEBAR_COLLAPSED_WIDTH = 88;
const TOPBAR_HEIGHT = 84;
const COMMERCIAL_CONTEXT_REFRESH_EVENT = "commercial-context:refresh";

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
  const [commercialContext, setCommercialContext] = useState<AgencyCommercialContext | null>(null);
  const [trialExpiredModalOpen, setTrialExpiredModalOpen] = useState(false);

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
  const settingsHref = `${agency.appBasePath}/settings#assinatura`;
  const jobsHref = `${agency.appBasePath}/jobs`;
  const canCreateJob = profile.role === "admin" || profile.platform_role === "super_admin";
  const trialBanner = useMemo(() => {
    if (!commercialContext?.trial.active) {
      return null;
    }

    const daysLeft = Math.max(1, commercialContext.trial.daysLeft);
    const dayLabel = daysLeft === 1 ? "dia" : "dias";

    if (daysLeft <= 3) {
      return {
        tone: "warning" as const,
        text: `⏳ Seu acesso completo termina em ${daysLeft} ${dayLabel}`,
        cta: "Continuar com tudo liberado"
      };
    }

    return {
      tone: "brand" as const,
      text: `🚀 Acesso completo ativo — ${daysLeft} ${dayLabel} restantes`,
      cta: null
    };
  }, [commercialContext]);

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
    let active = true;

    async function loadCommercialContext() {
      try {
        const response = await fetch("/api/subscription/context", {
          method: "GET",
          cache: "no-store"
        });

        if (!response.ok) {
          if (active) {
            setCommercialContext(null);
            setTrialExpiredModalOpen(false);
          }
          return;
        }

        const payload = (await response.json()) as { context?: AgencyCommercialContext };
        const context = payload.context;
        const storageKey = `trial-expired-modal:${profile.agency_id}`;

        if (!context) {
          if (active) {
            setCommercialContext(null);
            setTrialExpiredModalOpen(false);
          }
          return;
        }

        if (active) {
          setCommercialContext(context);

          if (context.trial.expired) {
            const alreadyDismissed = window.sessionStorage.getItem(storageKey) === "1";
            setTrialExpiredModalOpen(!alreadyDismissed);
          } else {
            window.sessionStorage.removeItem(storageKey);
            setTrialExpiredModalOpen(false);
          }
        }
      } catch {
        if (active) {
          setCommercialContext(null);
          setTrialExpiredModalOpen(false);
        }
      }
    }

    const handleContextRefresh = () => {
      void loadCommercialContext();
    };

    window.addEventListener(COMMERCIAL_CONTEXT_REFRESH_EVENT, handleContextRefresh);
    void loadCommercialContext();

    return () => {
      active = false;
      window.removeEventListener(COMMERCIAL_CONTEXT_REFRESH_EVENT, handleContextRefresh);
    };
  }, [profile.agency_id]);

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

  function dismissTrialExpiredModal() {
    window.sessionStorage.setItem(`trial-expired-modal:${profile.agency_id}`, "1");
    setTrialExpiredModalOpen(false);
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
        canCreateJob={canCreateJob}
        newJobHref={jobsHref}
        alertsHref={settingsHref}
        notificationCount={trialBanner ? 1 : 0}
        signingOut={signingOut}
        onSignOut={handleSignOut}
        onMobileMenuToggle={() => setMobileOpen((prev) => !prev)}
        desktopWidth={desktopWidth}
      />

      <AppSidebar
        navItems={navItems}
        pathname={pathname}
        agencyName={agencyState.name}
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
        className="relative pt-[5.75rem] transition-[padding] duration-200 lg:pt-[var(--top-offset)] lg:pl-[var(--content-offset)]"
        style={
          {
            ["--content-offset" as string]: `${desktopWidth}px`,
            ["--top-offset" as string]: `${TOPBAR_HEIGHT}px`
          } as CSSProperties
        }
      >
        <div className="w-full space-y-5 px-3 pb-5 md:px-5 md:pb-7">
          {trialBanner ? (
            <div
              className={
                trialBanner.tone === "warning"
                  ? "flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 md:flex-row md:items-center md:justify-between"
                  : "flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brandMuted px-4 py-3 md:flex-row md:items-center md:justify-between"
              }
            >
              <p className={trialBanner.tone === "warning" ? "text-sm font-medium text-amber-800" : "text-sm font-medium text-brand"}>
                {trialBanner.text}
              </p>
              {trialBanner.cta ? (
                <Link
                  href={settingsHref}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-text px-4 text-sm font-medium text-white transition hover:opacity-90"
                >
                  {trialBanner.cta}
                </Link>
              ) : null}
            </div>
          ) : null}

          {children}
        </div>
      </main>

      {trialExpiredModalOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <h3 className="text-lg font-semibold text-text">Seu acesso completo terminou</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted">
                Agora você está no plano Starter com limitações. Continue usando sem limites e sem travar sua operação.
              </p>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  onClick={() => {
                    dismissTrialExpiredModal();
                    router.push(settingsHref);
                  }}
                >
                  Desbloquear minha agência
                </Button>
                <Button type="button" variant="secondary" onClick={dismissTrialExpiredModal}>
                  Continuar no plano Starter
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
