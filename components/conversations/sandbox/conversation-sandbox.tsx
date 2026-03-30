"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConversationChat } from "@/components/conversations/sandbox/conversation-chat";
import { ConversationDebugPanel } from "@/components/conversations/sandbox/conversation-debug-panel";
import { ConversationSidebar } from "@/components/conversations/sandbox/conversation-sidebar";
import type {
  SandboxAgencyContext,
  SandboxDebugState,
  SandboxMessage,
  SandboxPostResponse,
  SandboxSelectableUser,
  SandboxSnapshot
} from "@/components/conversations/sandbox/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { resolveAgencyPathFromCurrent } from "@/lib/agency-routing";

type SandboxRouteResponse = {
  selectedUser: SandboxSelectableUser;
  snapshot: SandboxSnapshot;
};

const EMPTY_SNAPSHOT: SandboxSnapshot = {
  thread: null,
  messages: [],
  recentActions: [],
  debug: null
};

export function ConversationSandbox({
  agency,
  users,
  canAccessAsSuperAdmin
}: {
  agency: SandboxAgencyContext;
  users: SandboxSelectableUser[];
  canAccessAsSuperAdmin: boolean;
}) {
  const pathname = usePathname();
  const [selectedUserId, setSelectedUserId] = useState(() => users[0]?.id ?? "");
  const [snapshot, setSnapshot] = useState<SandboxSnapshot>(EMPTY_SNAPSHOT);
  const [draft, setDraft] = useState("");
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<SandboxDebugState | null>(null);
  const [ephemeralMessages, setEphemeralMessages] = useState<SandboxMessage[]>([]);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [selectedUserId, users]
  );

  const mergedMessages = useMemo(() => {
    if (ephemeralMessages.length === 0) {
      return snapshot.messages;
    }

    return [...snapshot.messages, ...ephemeralMessages];
  }, [ephemeralMessages, snapshot.messages]);

  const disabledMessage = useMemo(() => {
    if (!selectedUser) {
      return "Selecione um usuário da equipe para começar o teste.";
    }

    if (!selectedUser.phone_number) {
      return "Esse usuário ainda não tem WhatsApp cadastrado. Preencha o telefone na Equipe para liberar a simulação.";
    }

    if (!selectedUser.is_active) {
      return "Esse usuário está inativo. Você pode enviar a mensagem para validar o bloqueio, mas a execução será recusada pelo motor.";
    }

    if (!selectedUser.whatsapp_enabled) {
      return "O uso conversacional desse usuário está bloqueado. Você ainda pode testar para validar a resposta de bloqueio.";
    }

    return null;
  }, [selectedUser]);

  useEffect(() => {
    if (!selectedUserId) {
      setSnapshot(EMPTY_SNAPSHOT);
      setDebug(null);
      setError(null);
      setEphemeralMessages([]);
      return;
    }

    let ignore = false;

    async function loadSnapshot() {
      try {
        setLoadingSnapshot(true);
        setError(null);
        setEphemeralMessages([]);

        const response = await fetch(`/api/conversations/sandbox?userId=${selectedUserId}`, {
          method: "GET",
          cache: "no-store"
        });

        const payload = (await response.json()) as SandboxRouteResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error ?? "Falha ao carregar o histórico do sandbox.");
        }

        if (ignore) return;

        setSnapshot(payload.snapshot);
        setDebug(payload.snapshot.debug);
      } catch (loadError) {
        if (ignore) return;
        setSnapshot(EMPTY_SNAPSHOT);
        setDebug(null);
        setError(loadError instanceof Error ? loadError.message : "Falha ao carregar o sandbox.");
      } finally {
        if (!ignore) {
          setLoadingSnapshot(false);
        }
      }
    }

    loadSnapshot();

    return () => {
      ignore = true;
    };
  }, [selectedUserId]);

  async function handleSend() {
    if (!selectedUser || !draft.trim()) {
      return;
    }

    try {
      setSending(true);
      setError(null);

      const response = await fetch("/api/conversations/sandbox", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: selectedUser.id,
          message: draft.trim()
        })
      });

      const payload = (await response.json()) as SandboxPostResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao processar a mensagem no sandbox.");
      }

      setSnapshot(payload.snapshot);
      setDebug(payload.debug);
      setEphemeralMessages(payload.ephemeralMessages ?? []);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Falha ao processar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-brand/15 bg-brandMuted text-brand">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-text md:text-2xl">Sandbox conversacional</h1>
                  <p className="mt-1 text-sm leading-6 text-muted">
                    Ambiente interno premium para testar o operador do BRIFA com a engine real, sem depender de Postman ou WhatsApp externo.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canAccessAsSuperAdmin ? <Badge variant="brand">Super admin com acesso liberado</Badge> : null}
              <Link href={resolveAgencyPathFromCurrent(pathname, "/conversations")}>
                <Button variant="secondary">
                  <ArrowLeft className="h-4 w-4" />
                  Voltar para Conversas
                </Button>
              </Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {loadingSnapshot ? (
            <div className="flex min-h-[320px] items-center justify-center">
              <div className="flex items-center gap-3 rounded-full border border-border bg-panel px-5 py-3 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Carregando contexto do sandbox...</span>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)_360px]">
              <ConversationSidebar
                agency={agency}
                users={users}
                selectedUserId={selectedUserId}
                onUserChange={setSelectedUserId}
              />
              <ConversationChat
                disabled={!selectedUser || !selectedUser.phone_number}
                disabledMessage={disabledMessage}
                messages={mergedMessages}
                draft={draft}
                sending={sending}
                onDraftChange={setDraft}
                onSend={handleSend}
                onUsePrompt={setDraft}
              />
              <ConversationDebugPanel debug={debug} recentActions={snapshot.recentActions} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
