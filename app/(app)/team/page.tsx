"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingBlock } from "@/components/ui/loading";
import { Select } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";
import { AGENCY_ROLE_OPTIONS, normalizeAgencyRole } from "@/lib/agency-roles";
import { type AgencyCommercialContext } from "@/lib/commercial";
import type { Database, UserProfile } from "@/lib/database.types";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type UserRole = Database["public"]["Enums"]["user_role"];

type TeamInvitation = Database["public"]["Tables"]["team_invitations"]["Row"];

export default function TeamPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [commercialContext, setCommercialContext] = useState<AgencyCommercialContext | null>(null);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [memberPhones, setMemberPhones] = useState<Record<string, string>>({});
  const [memberWhatsappEnabled, setMemberWhatsappEnabled] = useState<Record<string, boolean>>({});
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingMemberField, setSavingMemberField] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteAgencyRole, setInviteAgencyRole] = useState("");
  const [inviting, setInviting] = useState(false);

  const isAdmin = useMemo(() => profile?.role === "admin", [profile?.role]);
  const invitePermission = commercialContext?.permissions.invite_user ?? { allowed: true, message: null };
  const readOnlyMode = commercialContext?.readOnlyMode ?? false;

  async function loadData() {
    setError("");

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
      const typedProfile = currentProfile as UserProfile | null;

      if (profileError || !typedProfile) {
        setError("Perfil não encontrado.");
        return;
      }

      setProfile(typedProfile);

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

      const { data: teamData, error: teamError } = await supabase
        .from("users")
        .select("*")
        .eq("agency_id", typedProfile.agency_id)
        .order("created_at", { ascending: true });
      const typedTeamData = (teamData ?? []) as UserProfile[];

      if (teamError) throw teamError;

      setMembers(typedTeamData);
      setMemberPhones(Object.fromEntries(typedTeamData.map((member) => [member.id, member.phone_number ?? ""])));
      setMemberWhatsappEnabled(
        Object.fromEntries(typedTeamData.map((member) => [member.id, member.whatsapp_enabled ?? true]))
      );

      if (typedProfile.role === "admin") {
        const { data: invitationData, error: invitationError } = await supabase
          .from("team_invitations")
          .select("*")
          .eq("agency_id", typedProfile.agency_id)
          .order("created_at", { ascending: false });

        if (invitationError) throw invitationError;
        setInvitations(invitationData ?? []);
      } else {
        setInvitations([]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Erro ao carregar equipe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAdmin) return;
    if (!invitePermission.allowed) {
      setError(invitePermission.message ?? "O convite de usuários está bloqueado para esta assinatura.");
      return;
    }
    if (!inviteName.trim() || !inviteEmail.trim() || !inviteAgencyRole.trim()) {
      setError("Preencha nome, e-mail e função para enviar o convite.");
      return;
    }

    try {
      setInviting(true);
      setError("");

      const response = await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
          agencyRole: inviteAgencyRole,
          role: "member"
        })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao enviar convite.");
      }

      setInviteName("");
      setInviteEmail("");
      setInviteAgencyRole("");
      await loadData();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Falha ao enviar convite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, role: UserRole) {
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }

    try {
      setError("");
      const supabase = createBrowserSupabaseClient();
      const supabaseUsersUpdate = supabase.from("users") as never as {
        update: (payload: Database["public"]["Tables"]["users"]["Update"]) => {
          eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error: updateError } = await supabaseUsersUpdate
        .update({ role })
        .eq("id", memberId);
      if (updateError) throw updateError;
      await loadData();
    } catch (roleError) {
      setError(roleError instanceof Error ? roleError.message : "Falha ao atualizar nível de acesso.");
    }
  }

  async function handleAgencyRoleChange(memberId: string, agencyRole: string) {
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }

    try {
      setError("");
      const supabase = createBrowserSupabaseClient();
      const supabaseUsersUpdate = supabase.from("users") as never as {
        update: (payload: Database["public"]["Tables"]["users"]["Update"]) => {
          eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error: updateError } = await supabaseUsersUpdate
        .update({ agency_role: agencyRole })
        .eq("id", memberId);
      if (updateError) throw updateError;
      await loadData();
    } catch (agencyRoleError) {
      setError(agencyRoleError instanceof Error ? agencyRoleError.message : "Falha ao atualizar função.");
    }
  }

  async function handleRemove(memberId: string) {
    if (!profile) return;
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }
    if (memberId === profile.id) {
      setError("Não é possível remover seu próprio usuário.");
      return;
    }
    if (!confirm("Deseja remover este membro da equipe?")) return;

    try {
      setError("");
      const response = await fetch(`/api/team/member/${memberId}`, {
        method: "DELETE"
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Falha ao remover membro.");
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Falha ao remover membro.");
    }
  }

  async function handlePhoneSave(memberId: string) {
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }

    try {
      setSavingMemberField(memberId);
      setError("");
      const supabase = createBrowserSupabaseClient();
      const nextPhoneRaw = memberPhones[memberId] ?? "";
      const normalizedPhone = normalizePhoneNumber(nextPhoneRaw);
      const supabaseUsersUpdate = supabase.from("users") as never as {
        update: (payload: Database["public"]["Tables"]["users"]["Update"]) => {
          eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
        };
      };

      if (nextPhoneRaw.trim().length > 0 && (!normalizedPhone || !isValidPhoneNumber(normalizedPhone))) {
        throw new Error("Informe o WhatsApp no formato 5511999999999, usando apenas números.");
      }

      const { error: updateError } = await supabaseUsersUpdate
        .update({ phone_number: normalizedPhone })
        .eq("id", memberId);

      if (updateError) throw updateError;

      setMemberPhones((current) => ({
        ...current,
        [memberId]: normalizedPhone ?? ""
      }));
    } catch (phoneError) {
      setError(phoneError instanceof Error ? phoneError.message : "Falha ao atualizar WhatsApp.");
    } finally {
      setSavingMemberField(null);
    }
  }

  async function handleWhatsAppToggle(memberId: string, enabled: boolean) {
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }

    try {
      setSavingMemberField(memberId);
      setError("");
      const supabase = createBrowserSupabaseClient();
      const supabaseUsersUpdate = supabase.from("users") as never as {
        update: (payload: Database["public"]["Tables"]["users"]["Update"]) => {
          eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
        };
      };
      const { error: updateError } = await supabaseUsersUpdate
        .update({ whatsapp_enabled: enabled })
        .eq("id", memberId);

      if (updateError) throw updateError;

      setMemberWhatsappEnabled((current) => ({
        ...current,
        [memberId]: enabled
      }));
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Falha ao atualizar permissão de WhatsApp.");
    } finally {
      setSavingMemberField(null);
    }
  }

  async function cancelInvitation(invitationId: string) {
    if (readOnlyMode) {
      setError(invitePermission.message ?? "Sua assinatura está em modo de visualização. Alterações na equipe estão bloqueadas.");
      return;
    }
    if (!confirm("Cancelar este convite?")) return;

    try {
      setError("");
      const supabase = createBrowserSupabaseClient();
      const { error: deleteError } = await supabase.from("team_invitations").delete().eq("id", invitationId);
      if (deleteError) throw deleteError;
      await loadData();
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Falha ao cancelar convite.");
    }
  }

  if (loading) return <LoadingBlock text="Carregando equipe..." />;

  return (
    <div className="space-y-6">
      {isAdmin ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Convidar membro</h2>
          </CardHeader>
          <CardContent>
            {!invitePermission.allowed ? (
              <p className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-700">
                {invitePermission.message}
              </p>
            ) : null}
            <form className="grid gap-3 md:grid-cols-[1fr_1fr_220px_auto]" onSubmit={handleInvite}>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
                <Input value={inviteName} onChange={(e) => setInviteName(e.target.value)} required />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">E-mail</label>
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Função</label>
                <Select value={inviteAgencyRole} onChange={(e) => setInviteAgencyRole(e.target.value)} required>
                  <option value="">Selecione uma função</option>
                  {AGENCY_ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  type="submit"
                  disabled={inviting || !invitePermission.allowed}
                  className="w-full md:w-auto"
                >
                  {inviting ? "Enviando..." : "Convidar"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Membros da equipe</h2>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <p className="text-sm text-muted">Nenhum membro encontrado.</p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className={cn(
                    "grid gap-3 rounded-xl border border-border p-3",
                    isAdmin
                      ? "md:grid-cols-[minmax(0,1fr)_220px_180px_240px_auto]"
                      : "md:grid-cols-[minmax(0,1fr)_220px_180px_240px]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={member.name}
                      avatarUrl={member.avatar_url}
                      updatedAt={member.updated_at}
                      className="h-11 w-11 bg-panel text-sm"
                      fallbackClassName="text-sm"
                    />
                    <div className="min-w-0">
                      <p className="font-medium">{member.name}</p>
                      <p className="truncate text-sm text-muted">{member.email}</p>
                    </div>
                  </div>

                  <div>
                    {isAdmin ? (
                      <>
                        <label className="mb-1 block text-xs font-medium text-muted">Função</label>
                        <Select
                          value={normalizeAgencyRole(member.agency_role)}
                          onChange={(e) => handleAgencyRoleChange(member.id, e.target.value)}
                          disabled={readOnlyMode}
                        >
                          {AGENCY_ROLE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-muted">Função</p>
                        <p className="text-sm">{normalizeAgencyRole(member.agency_role)}</p>
                      </>
                    )}
                  </div>

                  <div>
                    {isAdmin ? (
                      <>
                        <label className="mb-1 block text-xs font-medium text-muted">Nível</label>
                        <Select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                          disabled={member.id === profile?.id || readOnlyMode}
                        >
                          <option value="member">Membro</option>
                          <option value="admin">Administrador</option>
                        </Select>
                      </>
                    ) : (
                      <Badge variant={member.role === "admin" ? "brand" : "neutral"}>
                        {member.role === "admin" ? "Administrador" : "Membro"}
                      </Badge>
                    )}
                  </div>

                  <div>
                    {isAdmin ? (
                      <>
                        <label className="mb-1 block text-xs font-medium text-muted">WhatsApp</label>
                        <Input
                          value={memberPhones[member.id] ?? ""}
                          onChange={(e) =>
                            setMemberPhones((current) => ({
                              ...current,
                              [member.id]: e.target.value
                            }))
                          }
                          onBlur={() => void handlePhoneSave(member.id)}
                          placeholder="5511999999999"
                          disabled={readOnlyMode}
                        />
                        <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                          <input
                            type="checkbox"
                            checked={memberWhatsappEnabled[member.id] ?? true}
                            onChange={(e) => void handleWhatsAppToggle(member.id, e.target.checked)}
                            disabled={readOnlyMode}
                            className="h-4 w-4 rounded border-border text-brand focus:ring-brand"
                          />
                          Permitir uso via WhatsApp
                        </label>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-medium text-muted">WhatsApp</p>
                        <p className="text-sm">{member.phone_number || "Não informado"}</p>
                        <p className="mt-1 text-xs text-muted">
                          {member.whatsapp_enabled ? "Uso conversacional permitido" : "Uso conversacional bloqueado"}
                        </p>
                      </>
                    )}
                  </div>

                  {isAdmin ? (
                    <div className="flex justify-end">
                      {member.id !== profile?.id ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleRemove(member.id)}
                        disabled={readOnlyMode || savingMemberField === member.id}
                      >
                        Remover
                      </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Convites enviados</h2>
          </CardHeader>
          <CardContent>
            {invitations.length === 0 ? (
              <p className="text-sm text-muted">Nenhum convite registrado.</p>
            ) : (
              <div className="space-y-3">
                {invitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {invitation.name?.trim() || invitation.email.split("@")[0]}
                      </p>
                      <p className="text-sm text-muted">{normalizeAgencyRole(invitation.agency_role)}</p>
                      <p className="text-sm text-muted">{invitation.email}</p>
                      <p className="text-xs text-muted">
                        Nível: {invitation.role === "admin" ? "Administrador" : "Membro"} · Status:{" "}
                        {invitation.accepted_at ? "Aceito" : "Pendente"}
                      </p>
                    </div>
                    {!invitation.accepted_at ? (
                      <Button variant="secondary" size="sm" onClick={() => cancelInvitation(invitation.id)} disabled={readOnlyMode}>
                        Cancelar
                      </Button>
                    ) : (
                      <Badge variant="success">Aceito</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
