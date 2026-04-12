import { type ClassValue, clsx } from "clsx";
import { differenceInCalendarDays, format, isPast, parseISO } from "date-fns";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "Sem prazo";
  return format(parseISO(date), "dd/MM/yyyy");
}

export function isOverdue(date: string | null | undefined) {
  if (!date) return false;
  return isPast(parseISO(date));
}

export type DeadlineSignal = "ok" | "near" | "overdue" | "none";

export function getDeadlineSignal({
  dueDate,
  status
}: {
  dueDate: string | null | undefined;
  status?: string | null;
}): DeadlineSignal {
  if (!dueDate) return "none";
  if (status === "concluido" || status === "finalizado") return "ok";

  const days = differenceInCalendarDays(parseISO(dueDate), new Date());
  if (days < 0) return "overdue";
  if (days <= 1) return "near";
  return "ok";
}

export function toPercent(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getInitials(name: string | null | undefined) {
  const normalized = (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (normalized.length === 0) return "??";

  if (normalized.length === 1) {
    return normalized[0].slice(0, 2).toUpperCase();
  }

  return `${normalized[0][0] ?? ""}${normalized[normalized.length - 1][0] ?? ""}`.toUpperCase();
}

export const JOB_STATUS_LABEL: Record<string, string> = {
  briefing: "Briefing",
  criacao: "Criação",
  revisao: "Revisão",
  aprovado: "Aprovado",
  finalizado: "Finalizado"
};

export const JOB_STATUS_ORDER = ["briefing", "criacao", "revisao", "aprovado", "finalizado"] as const;

export const TASK_STATUS_LABEL: Record<string, string> = {
  a_fazer: "A Fazer",
  em_andamento: "Em andamento",
  revisao: "Revisão",
  concluido: "Concluído"
};

export const TASK_PRIORITY_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta"
};

export type StatusBadgeVariant =
  | "neutral"
  | "brand"
  | "warning"
  | "success"
  | "danger"
  | "statusBriefing"
  | "statusCriacao"
  | "statusRevisao"
  | "statusAprovado"
  | "statusFinalizado"
  | "statusEmAndamento"
  | "statusConcluido"
  | "statusAFazer";

export function getStatusBadgeVariant(status: string): StatusBadgeVariant {
  switch (status) {
    case "briefing":
      return "statusBriefing";
    case "criacao":
      return "statusCriacao";
    case "revisao":
      return "statusRevisao";
    case "aprovado":
      return "statusAprovado";
    case "finalizado":
      return "statusFinalizado";
    case "em_andamento":
      return "statusEmAndamento";
    case "concluido":
      return "statusConcluido";
    case "a_fazer":
      return "statusAFazer";
    default:
      return "neutral";
  }
}
