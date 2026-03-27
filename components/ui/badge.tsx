import { cn } from "@/lib/utils";

const variants = {
  neutral: "border border-border bg-panelAlt/80 text-text",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border border-amber-200 bg-amber-50 text-amber-700",
  danger: "border border-rose-200 bg-rose-50 text-rose-700",
  brand: "border border-brand/10 bg-brandMuted text-brand"
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
