"use client";

import { Badge } from "@/components/ui/badge";
import type { SandboxMessage } from "@/components/conversations/sandbox/types";
import { cn } from "@/lib/utils";

function getSenderLabel(senderType: SandboxMessage["sender_type"]) {
  if (senderType === "assistant") return "BRIFA";
  if (senderType === "system") return "Sistema";
  return "Usuário";
}

export function ConversationMessageBubble({ message }: { message: SandboxMessage }) {
  const isUser = message.sender_type === "user";
  const isSystem = message.sender_type === "system";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-[28px] border px-4 py-3 shadow-[0_20px_40px_-32px_rgba(15,23,42,0.22)] md:max-w-[78%]",
          isUser
            ? "border-brand bg-brand text-white"
            : isSystem
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-border bg-panel text-text"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("text-[11px] font-semibold uppercase tracking-[0.18em]", isUser ? "text-white/80" : "text-muted")}>
            {getSenderLabel(message.sender_type)}
          </span>
          {message.intent ? (
            <Badge variant={isUser ? "neutral" : message.sender_type === "assistant" ? "brand" : "warning"} className={cn("px-2 py-1 text-[10px]", isUser && "border-white/20 bg-white/15 text-white")}>
              {message.intent}
            </Badge>
          ) : null}
          <span className={cn("text-[11px]", isUser ? "text-white/70" : "text-muted")}>
            {new Date(message.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p className={cn("mt-3 whitespace-pre-wrap text-sm leading-6", isUser ? "text-white" : "text-text")}>
          {message.message_text}
        </p>
      </div>
    </div>
  );
}
