import { cn } from "@/lib/utils";

const variants = {
  neutral: "border border-border bg-panelAlt/80 text-text",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border border-amber-200 bg-amber-50 text-amber-700",
  danger: "border border-rose-200 bg-rose-50 text-rose-700",
  brand: "border border-brand/10 bg-brandMuted text-brand",
  statusBriefing: "border border-[#67b6f5] bg-white text-[#4f9de2]",
  statusCriacao: "border border-transparent bg-[#59a9ef] text-white",
  statusRevisao: "border border-transparent bg-[#f0ad44] text-white",
  statusAprovado: "border border-transparent bg-[#55a357] text-white",
  statusFinalizado: "border border-transparent bg-[#ea5a53] text-white",
  statusEmAndamento: "border border-transparent bg-[#4f81f6] text-white",
  statusConcluido: "border border-transparent bg-[#55a357] text-white",
  statusAFazer: "border border-[#d8d8d8] bg-[#f4f4f4] text-[#7e7e7e]"
} as const;

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  variant?: keyof typeof variants;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium tracking-[0.01em]",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
