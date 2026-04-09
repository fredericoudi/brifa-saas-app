"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { SanitizedConversationChannel } from "@/lib/conversation-admin";
import { CONVERSATION_PROVIDER_LABEL } from "@/services/conversation/providers/catalog";

type ManageableConversationProvider = Exclude<keyof typeof CONVERSATION_PROVIDER_LABEL, "internal_test">;

const PROVIDER_OPTIONS: ManageableConversationProvider[] = ["meta_cloud", "twilio", "z_api"];

export function ConversationChannelManager({
  initialChannel,
  webhookUrl,
  saveEndpoint = "/api/conversations/channel"
}: {
  initialChannel: SanitizedConversationChannel | null;
  webhookUrl: string;
  saveEndpoint?: string;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const [provider, setProvider] = useState<ManageableConversationProvider>(
    (initialChannel?.provider as ManageableConversationProvider | undefined) ?? "meta_cloud"
  );
  const [phoneNumber, setPhoneNumber] = useState(initialChannel?.phone_number ?? "");
  const [externalAccountId, setExternalAccountId] = useState(initialChannel?.external_account_id ?? "");
  const [webhookVerifyToken, setWebhookVerifyToken] = useState(initialChannel?.webhook_verify_token ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [isActive, setIsActive] = useState(initialChannel?.is_active ?? false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const hasSavedSecrets = useMemo(
    () => ({
      access: channel?.has_access_token ?? false,
      refresh: channel?.has_refresh_token ?? false
    }),
    [channel]
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSaving(true);
      setFeedback(null);

      const response = await fetch(saveEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          channelId: channel?.id,
          provider,
          phoneNumber,
          externalAccountId,
          webhookVerifyToken,
          accessToken,
          refreshToken,
          isActive
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        channel?: SanitizedConversationChannel;
      };

      if (!response.ok || !payload.channel) {
        throw new Error(payload.error ?? "Falha ao salvar a integração conversacional.");
      }

      setChannel(payload.channel);
      setAccessToken("");
      setRefreshToken("");
      setFeedback({
        type: "success",
        message: payload.channel.is_active
          ? "Integração salva e ativada com sucesso."
          : "Integração salva. Ela permanece desativada até você ativá-la."
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Falha ao salvar a integração conversacional."
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {feedback ? (
        <div
          className={
            feedback.type === "success"
              ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              : "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          }
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Provider</label>
          <Select value={provider} onChange={(event) => setProvider(event.target.value as ManageableConversationProvider)}>
            {PROVIDER_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {CONVERSATION_PROVIDER_LABEL[option]}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Número conectado</label>
          <Input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="5511999999999"
          />
          <p className="mt-1 text-xs text-muted">Armazene apenas números, com DDI. Ex.: 5511999999999.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">External account ID</label>
          <Input
            value={externalAccountId}
            onChange={(event) => setExternalAccountId(event.target.value)}
            placeholder="Ex.: phone_number_id, SID ou identificador do canal"
          />
          <p className="mt-1 text-xs text-muted">No Meta Cloud API, este campo normalmente recebe o `phone_number_id`.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Webhook verify token</label>
          <Input
            value={webhookVerifyToken}
            onChange={(event) => setWebhookVerifyToken(event.target.value)}
            placeholder="Token usado na validação do webhook"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Access token</label>
          <Input
            type="password"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder={hasSavedSecrets.access ? "Já existe um token salvo. Preencha apenas se quiser trocar." : "Cole aqui o token do provider"}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={hasSavedSecrets.access ? "success" : "neutral"}>
              {hasSavedSecrets.access ? "Token salvo" : "Sem token salvo"}
            </Badge>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Refresh token</label>
          <Input
            type="password"
            value={refreshToken}
            onChange={(event) => setRefreshToken(event.target.value)}
            placeholder={hasSavedSecrets.refresh ? "Já existe um refresh token salvo. Preencha apenas se quiser trocar." : "Opcional"}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant={hasSavedSecrets.refresh ? "success" : "neutral"}>
              {hasSavedSecrets.refresh ? "Refresh token salvo" : "Sem refresh token"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Webhook de entrada</label>
          <Input value={webhookUrl} readOnly />
          <p className="mt-1 text-xs text-muted">
            Use esta URL no provider para receber mensagens e acionar o operador conversacional do BRIFA.
          </p>
        </div>

        <label className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-panelAlt/35 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-text">Integração ativa</p>
            <p className="mt-1 text-xs text-muted">Quando ativa, o BRIFA pode receber e responder mensagens desse canal.</p>
          </div>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="h-5 w-5 rounded border-border text-brand focus:ring-brand"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando..." : "Salvar integração"}
        </Button>
        {channel?.updated_at ? (
          <p className="text-sm text-muted">
            Última atualização: {new Date(channel.updated_at).toLocaleString("pt-BR")}
          </p>
        ) : null}
      </div>
    </form>
  );
}
