"use client";

import { AlertTriangle, Bot, BrainCircuit, CheckCircle2, FileJson2, ShieldAlert } from "lucide-react";
import type { SandboxAction, SandboxDebugState } from "@/components/conversations/sandbox/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

function statusVariant(status: string | null | undefined) {
  if (status === "success") return "success" as const;
  if (status === "blocked" || status === "clarification_required") return "warning" as const;
  if (status === "error") return "danger" as const;
  return "neutral" as const;
}

function formatJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) {
    return "Nenhum dado estruturado nesta interação.";
  }

  return JSON.stringify(value, null, 2);
}

export function ConversationDebugPanel({
  debug,
  recentActions
}: {
  debug: SandboxDebugState | null;
  recentActions: SandboxAction[];
}) {
  const isError = Boolean(debug?.error) || debug?.status === "error";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-brand/15 bg-brandMuted text-brand">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Debug da IA</h2>
              <p className="mt-1 text-sm text-muted">Leitura da intenção, entidades extraídas e resultado da execução.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[24px] border border-border bg-panelAlt/45 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Intenção</p>
              <div className="mt-3 flex items-center gap-2">
                <Badge variant={debug?.intent && debug.intent !== "UNKNOWN" ? "brand" : "neutral"}>
                  {debug?.intent ?? "Aguardando"}
                </Badge>
              </div>
            </div>
            <div className="rounded-[24px] border border-border bg-panelAlt/45 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Confidence</p>
              <p className="mt-3 text-lg font-semibold text-text">
                {typeof debug?.confidence === "number" ? debug.confidence.toFixed(2) : "--"}
              </p>
            </div>
          </div>

          <div className="rounded-[24px] border border-border bg-panelAlt/45 p-4">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-brand" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ação executada</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{debug?.actionType ?? "Sem ação"}</Badge>
              <Badge variant={statusVariant(debug?.status)}>{debug?.status ?? "Aguardando"}</Badge>
            </div>
            {debug?.response ? <p className="mt-4 text-sm leading-6 text-text">{debug.response}</p> : null}
            {isError ? (
              <div className="mt-4 flex items-start gap-2 rounded-[18px] border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{debug?.error ?? "A execução não pôde ser concluída."}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-[24px] border border-border bg-panelAlt/45 p-4">
            <div className="flex items-center gap-2">
              <FileJson2 className="h-4 w-4 text-brand" />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Entidades extraídas</p>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-[18px] border border-border/80 bg-slate-950 px-4 py-3 text-xs leading-6 text-slate-100">
              {formatJson(debug?.entities)}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-text">Logs recentes</h2>
              <p className="mt-1 text-sm text-muted">Últimas execuções registradas nesta thread de sandbox.</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {recentActions.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[22px] border border-border bg-panelAlt/35 px-4 py-3 text-sm text-muted">
              <AlertTriangle className="h-4 w-4" />
              <span>Nenhum log disponível ainda para esse usuário.</span>
            </div>
          ) : (
            <div className="space-y-3">
              {recentActions.map((action) => (
                <div key={action.id} className="rounded-[22px] border border-border bg-panelAlt/35 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(action.status)}>{action.status}</Badge>
                    <Badge variant="neutral">{action.action_type}</Badge>
                  </div>
                  <div className="mt-3 space-y-1 text-sm text-muted">
                    <p>{new Date(action.created_at).toLocaleString("pt-BR")}</p>
                    {typeof action.result?.response === "string" ? (
                      <p className="text-text">{action.result.response}</p>
                    ) : null}
                    {typeof action.result?.error === "string" ? (
                      <p className="text-rose-700">{action.result.error}</p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
