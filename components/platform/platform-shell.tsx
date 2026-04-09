"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  Menu,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Users,
  X
} from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlatformFavicon } from "@/components/platform/platform-favicon";
import { resolvePlatformLoginPath, resolvePlatformPath } from "@/lib/agency-routing";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MASTER_SIDEBAR_WIDTH = 345;
const MASTER_TOPBAR_HEIGHT = 120;

const platformNavItems = [
  { href: resolvePlatformPath(), label: "Dashboard", icon: LayoutDashboard },
  { href: resolvePlatformPath("/agencies"), label: "Agências", icon: Building2 },
  { href: resolvePlatformPath("/plans"), label: "Configurar planos", icon: Grid2x2 },
  { href: resolvePlatformPath("/subscriptions"), label: "Assinaturas", icon: CreditCard },
  { href: resolvePlatformPath("/users"), label: "Usuários", icon: Users },
  { href: resolvePlatformPath("/conversations"), label: "Conversas", icon: MessageSquareText },
  { href: resolvePlatformPath("/settings"), label: "Configurações", icon: Settings }
] as const;

const pageTitleMap: Record<string, string> = {
  platform: "Dashboard Master",
  agencies: "Agências",
  plans: "Configurar planos",
  subscriptions: "Assinaturas",
  users: "Usuários",
  conversations: "Conversas",
  settings: "Configurações da Plataforma"
};

export function PlatformShell({
  children,
  profileName,
  profileEmail
}: {
  children: React.ReactNode;
  profileName: string;
  profileEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const pageTitle = useMemo(() => {
    const segments = pathname.split("/").filter(Boolean);
    const key =
      segments[0] === "app" && segments[1] === "platform"
        ? (segments[2] ?? "platform")
        : (segments[1] ?? "platform");
    return pageTitleMap[key] ?? "Painel Master";
  }, [pathname]);

  async function handleSignOut() {
    try {
      setSigningOut(true);
      const supabase = createBrowserSupabaseClient();
      await supabase.auth.signOut();
      router.replace(resolvePlatformLoginPath());
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg bg-dashboard-pattern text-text">
      <PlatformFavicon />

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/30 backdrop-blur-sm lg:hidden"
          aria-label="Fechar navegação do painel master"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[19.5rem] flex-col border-r border-border/80 bg-panel text-text shadow-panel transition-transform duration-200 lg:w-[var(--master-sidebar-width)] lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ ["--master-sidebar-width" as string]: `${MASTER_SIDEBAR_WIDTH}px` }}
      >
        <div className="border-b border-border/80 px-5 py-5 lg:flex lg:h-[120px] lg:items-center lg:px-6 lg:py-0">
          <div className="flex items-center justify-between gap-3 lg:w-full lg:justify-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-brandMuted text-brand shadow-soft">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text">Painel Master</p>
              <p className="truncate text-xs text-muted">Operação da plataforma SaaS</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panelAlt/80 text-muted lg:hidden"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar painel master"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5 px-4 py-6">
          {platformNavItems.map((item) => {
            const Icon = item.icon;
            const routePath = item.href.split("#")[0];
            const isActive =
              routePath === resolvePlatformPath()
                ? pathname === routePath
                : pathname === routePath || pathname.startsWith(`${routePath}/`);

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex h-[58px] items-center gap-3 rounded-[20px] px-4 text-base font-medium transition",
                  isActive
                    ? "bg-brand text-white shadow-[0_16px_28px_-22px_hsl(var(--brand)/0.95)]"
                    : "text-muted hover:bg-panelAlt hover:text-text"
                )}
              >
                <Icon className="h-[22px] w-[22px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border/80 bg-panelAlt/55 px-4 py-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 rounded-[22px] border border-border bg-panelAlt/60 px-3 py-3 text-sm text-muted transition hover:bg-panelAlt"
          >
            <ArrowLeft className="h-4 w-4" />
            <div>
              <p className="font-medium text-text">Voltar para a agência</p>
              <p className="text-xs text-muted">Abrir o painel operacional</p>
            </div>
          </Link>
        </div>
      </aside>

      <div
        className="lg:pl-[var(--master-sidebar-width)]"
        style={{ ["--master-sidebar-width" as string]: `${MASTER_SIDEBAR_WIDTH}px` }}
      >
        <header
          className="fixed left-0 right-0 top-0 z-30 h-[88px] border-b border-border/80 bg-panel/96 backdrop-blur-xl lg:left-[var(--master-sidebar-width)] lg:h-[var(--master-topbar-height)]"
          style={
            {
              ["--master-sidebar-width" as string]: `${MASTER_SIDEBAR_WIDTH}px`,
              ["--master-topbar-height" as string]: `${MASTER_TOPBAR_HEIGHT}px`
            } as CSSProperties
          }
        >
          <div className="flex h-full items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panelAlt/70 text-muted transition hover:bg-panelAlt lg:hidden"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir painel master"
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Plataforma</p>
                <h1 className="truncate text-lg font-semibold text-text lg:text-[1.7rem] lg:tracking-tight">{pageTitle}</h1>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-text">{profileName}</p>
                <p className="text-xs text-muted">{profileEmail}</p>
              </div>

              <Button type="button" variant="ghost" size="sm" disabled={signingOut} onClick={() => void handleSignOut()}>
                {signingOut ? "Saindo..." : "Sair"}
              </Button>
            </div>
          </div>
        </header>

        <main
          className="px-3 pb-5 pt-[5.75rem] md:px-5 md:pb-7 lg:pt-[var(--master-topbar-height)]"
          style={{ ["--master-topbar-height" as string]: `${MASTER_TOPBAR_HEIGHT}px` }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
