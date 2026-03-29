"use client";

import { useEffect, useMemo, useRef } from "react";
import { Loader2, SendHorizonal, Sparkles } from "lucide-react";
import { ConversationMessageBubble } from "@/components/conversations/sandbox/conversation-message-bubble";
import type { SandboxMessage } from "@/components/conversations/sandbox/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const QUICK_PROMPTS = [
  "Cria um job para cliente XPTO com prazo sexta",
  "Quais são minhas tarefas hoje?",
  "Coloca minha tarefa em revisão",
  "Como está a agência hoje?"
] as const;

export function ConversationChat({
  disabled,
  disabledMessage,
  messages,
  draft,
  sending,
  onDraftChange,
  onSend,
  onUsePrompt
}: {
  disabled?: boolean;
  disabledMessage?: string | null;
  messages: SandboxMessage[];
  draft: string;
  sending: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onUsePrompt: (value: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const hasMessages = messages.length > 0;
  const trimmedDraft = useMemo(() => draft.trim(), [draft]);

  return (
    <Card className="flex min-h-[720px] flex-col overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">Simulação da conversa</h2>
            <p className="mt-1 text-sm text-muted">
              Esta área usa o motor real do BRIFA e registra a thread interna de teste do usuário selecionado.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onUsePrompt(prompt)}
                className="rounded-full border border-border bg-panelAlt/70 px-3 py-2 text-xs font-medium text-muted transition hover:border-brand/25 hover:text-text"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div
          ref={scrollRef}
          className="relative flex-1 overflow-y-auto rounded-[28px] border border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(246,248,255,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] md:p-5"
        >
          {hasMessages ? (
            <div className="space-y-4">
              {messages.map((message) => (
                <ConversationMessageBubble key={message.id} message={message} />
              ))}
            </div>
          ) : (
            <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-brand/15 bg-brandMuted text-brand">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-text">Nenhuma conversa nesta simulação ainda</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                Selecione um usuário, escolha um prompt rápido ou escreva uma mensagem para validar intenções, permissões e respostas do operador conversacional.
              </p>
            </div>
          )}
        </div>

        {disabledMessage ? (
          <div className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {disabledMessage}
          </div>
        ) : null}

        <div className="rounded-[28px] border border-border/80 bg-panel p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.2)]">
          <div className="flex flex-col gap-4">
            <label className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Mensagem de teste</label>
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              placeholder="Ex.: Cria um job para cliente XPTO com prazo sexta"
              className={cn(
                "min-h-[120px] w-full resize-none rounded-[22px] border border-border bg-panelAlt px-4 py-3 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_hsl(var(--brand)/0.08)]",
                disabled && "cursor-not-allowed opacity-70"
              )}
              disabled={disabled || sending}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">
                O envio usa o telefone do usuário selecionado e passa pela mesma engine que vai alimentar o WhatsApp.
              </p>
              <Button
                type="button"
                onClick={onSend}
                disabled={disabled || sending || trimmedDraft.length === 0}
                className="min-w-[150px]"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizonal className="h-4 w-4" />}
                {sending ? "Processando..." : "Enviar"}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
