"use client";

import { Activity, Building2, MessageCircleMore, Shield, Smartphone, Users } from "lucide-react";
import type { SandboxAgencyContext, SandboxSelectableUser } from "@/components/conversations/sandbox/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { UserAvatar } from "@/components/ui/user-avatar";

function getRoleLabel(user: SandboxSelectableUser | null) {
  if (!user) return "-";
  if (user.role === "admin") return "Administrador";
  return "Membro";
}

export function ConversationSidebar({
  agency,
  users,
  selectedUserId,
  onUserChange
}: {
  agency: SandboxAgencyContext;
  users: SandboxSelectableUser[];
  selectedUserId: string;
  onUserChange: (value: string) => void;
}) {
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/15 bg-brandMuted text-brand">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Contexto da agência</h2>
              <p className="mt-1 text-sm text-muted">O sandbox roda no contexto da agência atual da sessão.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-[24px] border border-border bg-panelAlt/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Agência</p>
            <p className="mt-3 text-base font-semibold text-text">{agency.name}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {agency.slug ? <Badge variant="neutral">/{agency.slug}</Badge> : null}
              <Badge variant={agency.status === "active" || agency.status === "trial" ? "success" : "warning"}>
                {agency.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/15 bg-brandMuted text-brand">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Usuário simulado</h2>
              <p className="mt-1 text-sm text-muted">Escolha o membro da equipe que será a origem das mensagens.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Selecionar usuário
            </label>
            <Select value={selectedUserId} onChange={(event) => onUserChange(event.target.value)}>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
          </div>

          {selectedUser ? (
            <div className="space-y-4 rounded-[26px] border border-border bg-panelAlt/40 p-4">
              <div className="flex items-center gap-3">
                <UserAvatar
                  name={selectedUser.name}
                  avatarUrl={selectedUser.avatar_url}
                  updatedAt={selectedUser.updated_at}
                  className="h-14 w-14"
                  fallbackClassName="text-sm"
                />
                <div>
                  <p className="text-base font-semibold text-text">{selectedUser.name}</p>
                  <p className="text-sm text-muted">{selectedUser.email}</p>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="flex items-start gap-3 rounded-[20px] border border-border/80 bg-panel px-3 py-3">
                  <Shield className="mt-0.5 h-4 w-4 text-brand" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Role</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={selectedUser.role === "admin" ? "brand" : "neutral"}>{getRoleLabel(selectedUser)}</Badge>
                      <Badge variant="neutral">{selectedUser.agency_role || "Sem função"}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[20px] border border-border/80 bg-panel px-3 py-3">
                  <Smartphone className="mt-0.5 h-4 w-4 text-brand" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">WhatsApp</p>
                    <p className="mt-2 text-sm text-text">{selectedUser.phone_number ?? "Não cadastrado"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={selectedUser.whatsapp_enabled ? "success" : "warning"}>
                        {selectedUser.whatsapp_enabled ? "Uso conversacional ativo" : "Uso conversacional bloqueado"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[20px] border border-border/80 bg-panel px-3 py-3">
                  <Activity className="mt-0.5 h-4 w-4 text-brand" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Status</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={selectedUser.is_active ? "success" : "warning"}>
                        {selectedUser.is_active ? "Usuário ativo" : "Usuário inativo"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-[20px] border border-border/80 bg-panel px-3 py-3">
                  <MessageCircleMore className="mt-0.5 h-4 w-4 text-brand" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Observação</p>
                    <p className="mt-2 text-sm leading-6 text-muted">
                      As mensagens são processadas como se viessem desse usuário, usando o telefone cadastrado na equipe.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-[22px] border border-border bg-panelAlt/35 px-4 py-3 text-sm text-muted">
              Selecione um usuário para iniciar a simulação.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
