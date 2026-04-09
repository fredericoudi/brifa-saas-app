import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { ConversationChannelManager } from "@/components/conversations/conversation-channel-manager";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { getPlatformConversationOverview } from "@/lib/conversation-admin";
import { requireSuperAdmin } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/master-server";
import { CONVERSATION_PROVIDER_LABEL, isConversationProvider } from "@/services/conversation/providers/catalog";

function actionStatusVariant(status: string) {
  if (status === "success") return "success" as const;
  if (status === "blocked" || status === "clarification_required") return "warning" as const;
  if (status === "error") return "danger" as const;
  return "neutral" as const;
}

function senderVariant(senderType: string) {
  if (senderType === "assistant") return "brand" as const;
  if (senderType === "system") return "warning" as const;
  return "neutral" as const;
}

function getConversationProviderLabel(provider: string | null | undefined) {
  return provider && isConversationProvider(provider) ? CONVERSATION_PROVIDER_LABEL[provider] : "Provider desconhecido";
}

export default async function PlatformConversationsPage() {
  await requireSuperAdmin();

  let overview: Awaited<ReturnType<typeof getPlatformConversationOverview>> | null = null;
  let loadError: string | null = null;

  try {
    overview = await getPlatformConversationOverview();
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Falha ao carregar a camada conversacional da plataforma.";
  }

  const activeChannel = overview?.channel ?? null;
  const webhookUrl = `${getRequestOrigin().replace(/\/$/, "")}/api/whatsapp/webhook`;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <MetricCard
          title="Canal ativo"
          value={activeChannel?.is_active ? "Sim" : "Não"}
          subtitle={activeChannel ? getConversationProviderLabel(activeChannel.provider) : "Nenhum canal global configurado"}
        />
        <MetricCard title="Threads" value={overview?.metrics.totalThreads ?? 0} subtitle="Conversas registradas" />
        <MetricCard title="Mensagens" value={overview?.metrics.totalMessages ?? 0} subtitle="Entrada e resposta" />
        <MetricCard title="Ações" value={overview?.metrics.totalActions ?? 0} subtitle="Execuções do operador" />
      </section>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Sandbox interno</h2>
              <p className="mt-1 text-sm text-muted">
                Teste o operador conversacional com a engine real sem depender do WhatsApp externo.
              </p>
            </div>
            <Link href={resolvePlatformPath("/conversations/sandbox")}>
              <Button>Abrir sandbox</Button>
            </Link>
          </div>
        </CardHeader>
      </Card>

      {loadError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Integração conversacional global</h2>
              <p className="mt-1 text-sm text-muted">
                Configure o canal principal da plataforma. Quando ativo, ele habilita automaticamente todas as agências.
              </p>
            </div>
            {activeChannel ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={activeChannel.is_active ? "success" : "neutral"}>
                  {activeChannel.is_active ? "Ativa" : "Inativa"}
                </Badge>
                <Badge variant="brand">{getConversationProviderLabel(activeChannel.provider)}</Badge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <ConversationChannelManager
            initialChannel={activeChannel}
            webhookUrl={webhookUrl}
            saveEndpoint="/api/platform/conversations/channel"
          />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Últimas mensagens</h2>
            <p className="mt-1 text-sm text-muted">Histórico recente de mensagens processadas no canal global.</p>
          </CardHeader>
          <CardContent>
            {!overview || overview.recentMessages.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma mensagem registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {overview.recentMessages.map((message) => (
                  <div key={message.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={senderVariant(message.sender_type)}>
                        {message.sender_type === "assistant"
                          ? "Assistente"
                          : message.sender_type === "system"
                            ? "Sistema"
                            : "Usuário"}
                      </Badge>
                      {message.intent ? <Badge variant="neutral">{message.intent}</Badge> : null}
                    </div>
                    <p className="mt-3 text-sm text-text">{message.message_text}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>Agência: {message.agencyName ?? "Não identificada"}</span>
                      <span>Contato: {message.thread?.external_contact_id ?? "Não identificado"}</span>
                      <span>Canal: {message.thread?.channel ?? "-"}</span>
                      <span>Usuário: {message.userName ?? "Não vinculado"}</span>
                      <span>{new Date(message.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold">Log de ações</h2>
            <p className="mt-1 text-sm text-muted">Execuções recentes do operador para auditoria e depuração.</p>
          </CardHeader>
          <CardContent>
            {!overview || overview.recentActions.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma ação registrada ainda.</p>
            ) : (
              <div className="space-y-3">
                {overview.recentActions.map((action) => (
                  <div key={action.id} className="rounded-2xl border border-border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={actionStatusVariant(action.status)}>{action.status}</Badge>
                      <Badge variant="neutral">{action.action_type}</Badge>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted">
                      <p>Agência: {action.agencyName ?? "Não identificada"}</p>
                      <p>Usuário: {action.userName ?? "Sistema"}</p>
                      <p>Em: {new Date(action.created_at).toLocaleString("pt-BR")}</p>
                      {action.result && typeof action.result === "object" && "response" in action.result ? (
                        <p className="text-text">Resposta: {String(action.result.response ?? "")}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
