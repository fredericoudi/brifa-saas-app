"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AgencyMark } from "@/components/layout/agency-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/loading";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  AGENCY_BRAND_EVENT,
  DEFAULT_BRAND_HEX,
  getAgencyBrandTheme,
  normalizeHexColor
} from "@/lib/agency-branding";
import {
  COMMERCIAL_STATUS_LABEL,
  COMMERCIAL_STATUS_VARIANT,
  formatPlanLimit,
  type AgencyCommercialContext
} from "@/lib/commercial";
import type { Agency, AgencyIntegration, UserProfile } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [agency, setAgency] = useState<Agency | null>(null);
  const [googleDriveIntegration, setGoogleDriveIntegration] = useState<AgencyIntegration | null>(null);
  const [commercialContext, setCommercialContext] = useState<AgencyCommercialContext | null>(null);
  const [commercialLoaded, setCommercialLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingAgency, setSavingAgency] = useState(false);
  const [savingDrive, setSavingDrive] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [name, setName] = useState("");
  const [weeklyCapacity, setWeeklyCapacity] = useState("40");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [agencyName, setAgencyName] = useState("");
  const [agencyLogoUrl, setAgencyLogoUrl] = useState<string | null>(null);
  const [brandColor, setBrandColor] = useState(DEFAULT_BRAND_HEX);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [rootFolderId, setRootFolderId] = useState("");
  const [showUpgradeHint, setShowUpgradeHint] = useState(false);

  const isAdmin = useMemo(() => profile?.role === "admin", [profile?.role]);
  const resolvedBrandColor = useMemo(() => normalizeHexColor(brandColor) ?? DEFAULT_BRAND_HEX, [brandColor]);
  const brandTheme = useMemo(() => getAgencyBrandTheme(brandColor), [brandColor]);
  const displayedLogoUrl = logoPreviewUrl ?? agencyLogoUrl;
  const displayedAvatarUrl = avatarPreviewUrl ?? avatarUrl;
  const googleDrivePermission = commercialContext?.permissions.google_drive ?? { allowed: true, message: null };

  async function loadData() {
    setError("");
    setCommercialLoaded(false);

    try {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada.");
        return;
      }

      const { data: currentProfile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !currentProfile) {
        setError("Perfil não encontrado.");
        return;
      }

      const { data: currentAgency, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", currentProfile.agency_id)
        .single();

      if (agencyError || !currentAgency) {
        setError("Agência não encontrada.");
        return;
      }

      setProfile(currentProfile);
      setAgency(currentAgency);
      setName(currentProfile.name);
      setWeeklyCapacity(String(currentProfile.weekly_capacity_hours || 40));
      setAvatarUrl(currentProfile.avatar_url ?? null);
      setAvatarFile(null);
      setAgencyName(currentAgency.name);
      setAgencyLogoUrl(currentAgency.logo_url ?? null);
      setBrandColor(currentAgency.brand_color ?? DEFAULT_BRAND_HEX);
      setLogoFile(null);

      const commercialResponse = await fetch("/api/subscription/context", {
        method: "GET",
        cache: "no-store"
      });
      const commercialPayload = (await commercialResponse.json()) as {
        error?: string;
        context?: AgencyCommercialContext;
      };

      if (commercialResponse.ok && commercialPayload.context) {
        setCommercialContext(commercialPayload.context);
      } else {
        setCommercialContext(null);
      }

      if (currentProfile.role === "admin") {
        const { data: integrationData } = await supabase
          .from("agency_integrations")
          .select("*")
          .eq("agency_id", currentProfile.agency_id)
          .eq("provider", "google_drive")
          .maybeSingle();

        setGoogleDriveIntegration(integrationData ?? null);
        setRootFolderId(integrationData?.root_folder_id ?? "");
      } else {
        setGoogleDriveIntegration(null);
        setRootFolderId("");
      }
    } catch {
      setError("Erro ao carregar configurações.");
    } finally {
      setCommercialLoaded(true);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [logoFile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [avatarFile]);

  useEffect(() => {
    const successParam = searchParams.get("success");
    const errorParam = searchParams.get("error");

    if (successParam === "google_drive_connected") {
      setSuccess("Google Drive conectado com sucesso.");
      setError("");
    }

    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setSuccess("");
    }
  }, [searchParams]);

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) return;

    try {
      setSavingProfile(true);
      setError("");
      setSuccess("");
      const supabase = createBrowserSupabaseClient();
      let nextAvatarUrl = profile.avatar_url ?? null;

      if (avatarFile) {
        const avatarPath = `${profile.id}/avatar`;
        const { error: uploadError } = await supabase.storage.from("user-assets").upload(avatarPath, avatarFile, {
          upsert: true,
          contentType: avatarFile.type,
          cacheControl: "3600"
        });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("user-assets").getPublicUrl(avatarPath);
        nextAvatarUrl = publicUrlData.publicUrl;
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          name,
          avatar_url: nextAvatarUrl,
          weekly_capacity_hours: Number(weeklyCapacity || 0)
        })
        .eq("id", profile.id);

      if (updateError) throw updateError;
      setAvatarUrl(nextAvatarUrl);
      setAvatarFile(null);
      setSuccess("Perfil atualizado com sucesso.");
      await loadData();
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Falha ao salvar perfil.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveAgency(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!agency || !isAdmin) return;

    try {
      const normalizedBrandColor = normalizeHexColor(brandColor);

      if (!normalizedBrandColor) {
        setError("Informe uma cor hexadecimal válida. Ex.: #F97316.");
        return;
      }

      setSavingAgency(true);
      setError("");
      setSuccess("");
      const supabase = createBrowserSupabaseClient();
      let nextLogoUrl = agency.logo_url ?? null;

      if (logoFile) {
        const logoPath = `${agency.id}/logo`;
        const { error: uploadError } = await supabase.storage.from("agency-assets").upload(logoPath, logoFile, {
          upsert: true,
          contentType: logoFile.type,
          cacheControl: "3600"
        });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage.from("agency-assets").getPublicUrl(logoPath);
        nextLogoUrl = publicUrlData.publicUrl;
      }

      const { data: updatedAgency, error: updateError } = await supabase
        .from("agencies")
        .update({
          name: agencyName,
          logo_url: nextLogoUrl,
          brand_color: normalizedBrandColor
        })
        .eq("id", agency.id)
        .select("*")
        .single();

      if (updateError || !updatedAgency) throw updateError;

      setAgency(updatedAgency);
      setAgencyName(updatedAgency.name);
      setAgencyLogoUrl(updatedAgency.logo_url ?? null);
      setBrandColor(updatedAgency.brand_color ?? DEFAULT_BRAND_HEX);
      setLogoFile(null);

      window.dispatchEvent(
        new CustomEvent(AGENCY_BRAND_EVENT, {
          detail: {
            agencyName: updatedAgency.name,
            logoUrl: updatedAgency.logo_url ?? null,
            brandColor: updatedAgency.brand_color ?? null,
            updatedAt: updatedAgency.updated_at
          }
        })
      );

      setSuccess("Configurações da agência atualizadas.");
      await loadData();
    } catch (agencyError) {
      setError(agencyError instanceof Error ? agencyError.message : "Falha ao salvar agência.");
    } finally {
      setSavingAgency(false);
    }
  }

  async function saveGoogleDriveRootFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || !googleDriveIntegration) return;

    try {
      setSavingDrive(true);
      setError("");
      setSuccess("");

      const response = await fetch("/api/integrations/google-drive/root-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootFolderId: rootFolderId || null })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao salvar pasta raiz.");
      }

      setSuccess("Configuração do Google Drive atualizada.");
      await loadData();
    } catch (driveError) {
      setError(driveError instanceof Error ? driveError.message : "Falha ao salvar integração do Google Drive.");
    } finally {
      setSavingDrive(false);
    }
  }

  function connectGoogleDrive() {
    window.location.href = "/api/integrations/google-drive/connect";
  }

  async function validateSquareLogo(file: File) {
    const objectUrl = URL.createObjectURL(file);

    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
          resolve({
            width: image.naturalWidth,
            height: image.naturalHeight
          });
        };

        image.onerror = () => {
          reject(new Error("Não foi possível ler as dimensões do arquivo enviado."));
        };

        image.src = objectUrl;
      });

      return dimensions.width === dimensions.height;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleLogoSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      setLogoFile(null);
      return;
    }

    if (!nextFile.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido para o logo da agência.");
      return;
    }

    if (nextFile.size > 5 * 1024 * 1024) {
      setError("O logo deve ter no máximo 5MB.");
      event.target.value = "";
      return;
    }

    const isSquareLogo = await validateSquareLogo(nextFile);

    if (!isSquareLogo) {
      setError("O logo deve estar em formato quadrado (proporção 1:1), por exemplo 512x512.");
      event.target.value = "";
      return;
    }

    setError("");
    setLogoFile(nextFile);
  }

  async function handleAvatarSelection(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;

    if (!nextFile) {
      setAvatarFile(null);
      return;
    }

    if (!nextFile.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem válido para a foto de perfil.");
      event.target.value = "";
      return;
    }

    if (nextFile.size > 5 * 1024 * 1024) {
      setError("A foto de perfil deve ter no máximo 5MB.");
      event.target.value = "";
      return;
    }

    setError("");
    setAvatarFile(nextFile);
  }

  if (loading) return <LoadingBlock text="Carregando configurações..." />;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}

      <Card id="perfil">
        <CardHeader>
          <h2 className="text-base font-semibold">Meu perfil</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={saveProfile}>
            <div className="md:col-span-2 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Foto de perfil</label>
                <div className="rounded-2xl border border-border bg-panelAlt/50 p-4">
                  <div className="flex items-center gap-4">
                    <UserAvatar
                      name={name || profile?.name || "Usuário"}
                      avatarUrl={displayedAvatarUrl}
                      updatedAt={profile?.updated_at}
                      className="h-16 w-16 border-border bg-panel text-base"
                      fallbackClassName="text-base"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {avatarFile ? avatarFile.name : avatarUrl ? "Foto atual do perfil" : "Nenhuma foto enviada"}
                      </p>
                      <p className="mt-1 text-xs text-muted">PNG, JPG, SVG ou WEBP até 5MB.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Arquivo da foto</label>
                <label className="flex min-h-[112px] cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-border bg-panelAlt/35 px-4 py-3 text-left transition hover:border-brand hover:bg-brand/5">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleAvatarSelection}
                    className="hidden"
                  />
                  <span className="text-sm font-medium text-text">
                    {avatarFile ? "Trocar foto selecionada" : avatarUrl ? "Trocar foto do perfil" : "Selecionar foto do perfil"}
                  </span>
                  <span className="mt-1 text-xs text-muted">
                    A foto será usada na equipe, no Kanban e em pontos de identificação do app.
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">E-mail</label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Capacidade semanal (horas)</label>
              <Input
                type="number"
                min={1}
                value={weeklyCapacity}
                onChange={(e) => setWeeklyCapacity(e.target.value)}
                required
              />
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={savingProfile}>
                {savingProfile ? "Salvando..." : "Salvar perfil"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card id="agencia">
        <CardHeader>
          <h2 className="text-base font-semibold">Agência</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={saveAgency}>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nome da agência</label>
              <Input
                value={agencyName}
                onChange={(e) => setAgencyName(e.target.value)}
                required
                disabled={!isAdmin}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Slug da agência</label>
              <Input value={agency?.slug ?? ""} disabled />
            </div>

            <div className="md:col-span-2 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Logo / ícone</label>
                <div className="rounded-2xl border border-border bg-panelAlt/50 p-4">
                  <div className="flex items-center gap-4">
                    <AgencyMark
                      agencyName={agencyName || agency?.name || "Agência"}
                      logoUrl={displayedLogoUrl}
                      updatedAt={agency?.updated_at}
                      className="h-16 w-16 rounded-2xl shadow-soft"
                      fallbackClassName="text-lg font-semibold"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-text">
                        {logoFile ? logoFile.name : agencyLogoUrl ? "Logo atual da agência" : "Nenhum logo enviado"}
                      </p>
                      <p className="mt-1 text-xs text-muted">Formato quadrado 1:1. PNG, JPG, SVG ou WEBP até 5MB.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Arquivo do logo</label>
                <label className="flex min-h-[112px] cursor-pointer flex-col justify-center rounded-2xl border border-dashed border-border bg-panelAlt/35 px-4 py-3 text-left transition hover:border-brand hover:bg-brand/5">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoSelection}
                    disabled={!isAdmin}
                    className="hidden"
                  />
                  <span className="text-sm font-medium text-text">
                    {logoFile ? "Trocar imagem selecionada" : agencyLogoUrl ? "Trocar logo da agência" : "Selecionar logo da agência"}
                  </span>
                  <span className="mt-1 text-xs text-muted">
                    {isAdmin
                      ? "Envie um logo quadrado para funcionar bem no topo e na sidebar."
                      : "Somente administradores podem alterar o logo da agência."}
                  </span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2 grid gap-4 lg:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Cor principal</label>
                <div className="rounded-2xl border border-border bg-panelAlt/50 p-4">
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={resolvedBrandColor}
                      onChange={(event) => setBrandColor(event.target.value.toUpperCase())}
                      disabled={!isAdmin}
                      className="h-12 w-12 cursor-pointer rounded-xl border border-border bg-panel p-1 disabled:cursor-not-allowed"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{resolvedBrandColor}</p>
                      <p className="mt-1 text-xs text-muted">
                        A cor principal substitui o roxo atual nos destaques e ações do aplicativo.
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Tom principal</p>
                      <div
                        className="mt-2 h-10 rounded-lg border border-border"
                        style={{ backgroundColor: `hsl(${brandTheme.brandCss})` }}
                      />
                    </div>
                    <div className="rounded-xl border border-border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">Tom suave do fundo</p>
                      <div
                        className="mt-2 h-10 rounded-lg border border-border"
                        style={{ backgroundColor: `hsl(${brandTheme.brandMutedCss})` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Hexadecimal</label>
                <Input
                  value={brandColor}
                  onChange={(event) => setBrandColor(event.target.value)}
                  placeholder="#F97316"
                  disabled={!isAdmin}
                  maxLength={7}
                />
                <p className="mt-1 text-xs text-muted">
                  Digite a cor principal da agência. Exemplo: <span className="font-medium">{DEFAULT_BRAND_HEX}</span>.
                </p>
              </div>
            </div>

            <div className="md:col-span-2">
              {isAdmin ? (
                <Button type="submit" disabled={savingAgency}>
                  {savingAgency ? "Salvando..." : "Salvar agência"}
                </Button>
              ) : (
                <p className="text-sm text-muted">Somente administradores podem editar os dados da agência.</p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Plano e Assinatura</h2>
          <p className="mt-1 text-sm text-muted">Visão comercial da agência, com trial, limites e recursos do plano.</p>
        </CardHeader>
        <CardContent>
          {!commercialLoaded ? (
            <LoadingBlock text="Carregando plano e assinatura..." />
          ) : !commercialContext ? (
            <p className="text-sm text-muted">Não foi possível carregar os dados comerciais da agência no momento.</p>
          ) : (
            <div className="space-y-4">
              {commercialContext.readOnlyMode ? (
                <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-700">
                  {commercialContext.permissions.create_job.message}
                </p>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Plano atual</p>
                  <p className="mt-2 text-lg font-semibold text-text">{commercialContext.plan.name}</p>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Status</p>
                  <div className="mt-2">
                    <Badge variant={COMMERCIAL_STATUS_VARIANT[commercialContext.effectiveStatus]}>
                      {COMMERCIAL_STATUS_LABEL[commercialContext.effectiveStatus]}
                    </Badge>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Trial termina em</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {commercialContext.subscription.trial_ends_at ? formatDate(commercialContext.subscription.trial_ends_at) : "Sem trial"}
                  </p>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">Próxima cobrança</p>
                  <p className="mt-2 text-lg font-semibold text-text">
                    {commercialContext.subscription.next_billing_date
                      ? formatDate(commercialContext.subscription.next_billing_date)
                      : "A definir"}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm font-medium text-text">Limites do plano</p>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p>
                      Usuários usados:{" "}
                      <span className="font-medium text-text">
                        {commercialContext.usage.users} de {formatPlanLimit(commercialContext.plan.max_users)}
                      </span>
                    </p>
                    <p>
                      Jobs criados:{" "}
                      <span className="font-medium text-text">
                        {commercialContext.usage.jobs} de {formatPlanLimit(commercialContext.plan.max_jobs)}
                      </span>
                    </p>
                    <p>
                      Valor mensal:{" "}
                      <span className="font-medium text-text">
                        R$ {Number(commercialContext.plan.price_monthly).toFixed(2).replace(".", ",")}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm font-medium text-text">Recursos disponíveis</p>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    <p>
                      IA para briefing:{" "}
                      <span className="font-medium text-text">
                        {commercialContext.plan.ai_briefing_enabled ? "Habilitada" : "Indisponível"}
                      </span>
                    </p>
                    <p>
                      Google Drive:{" "}
                      <span className="font-medium text-text">
                        {commercialContext.plan.google_drive_enabled ? "Habilitado" : "Indisponível"}
                      </span>
                    </p>
                    <p>
                      Ciclo de cobrança: <span className="font-medium text-text">Mensal</span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="secondary" onClick={() => setShowUpgradeHint((current) => !current)}>
                  Solicitar upgrade
                </Button>
                {showUpgradeHint ? (
                  <p className="text-sm text-muted">
                    Entre em contato com o comercial ou com o super admin da plataforma para alterar o plano da agência.
                  </p>
                ) : null}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Google Drive</h2>
        </CardHeader>
        <CardContent>
          {!isAdmin ? (
            <p className="text-sm text-muted">Somente administradores podem configurar integrações.</p>
          ) : (
            <div className="space-y-4">
              {!googleDrivePermission.allowed ? (
                <p className="rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-700">{googleDrivePermission.message}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={connectGoogleDrive} disabled={!googleDrivePermission.allowed}>
                  {googleDriveIntegration ? "Reconectar Google Drive" : "Conectar Google Drive"}
                </Button>
                <span className="text-sm text-muted">
                  {googleDriveIntegration ? "Conta conectada" : "Nenhuma conta conectada"}
                </span>
              </div>

              {googleDriveIntegration ? (
                <form className="grid gap-3 md:grid-cols-[1fr_auto]" onSubmit={saveGoogleDriveRootFolder}>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">ID da pasta raiz no Google Drive</label>
                    <Input
                      placeholder="Ex.: 1AbCdEfGhIjKlMnOpQrStUvWxYz"
                      value={rootFolderId}
                      onChange={(e) => setRootFolderId(e.target.value)}
                      disabled={!googleDrivePermission.allowed}
                    />
                    <p className="mt-1 text-xs text-muted">
                      Todos os novos jobs serão criados dentro desta pasta.
                    </p>
                  </div>

                  <div className="flex items-end">
                    <Button type="submit" disabled={savingDrive || !googleDrivePermission.allowed}>
                      {savingDrive ? "Salvando..." : "Salvar pasta raiz"}
                    </Button>
                  </div>
                </form>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
