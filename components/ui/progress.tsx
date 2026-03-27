import { cn } from "@/lib/utils";

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-2.5 w-full overflow-hidden rounded-full border border-border/50 bg-panelAlt/90", className)}>
      <div className="h-full rounded-full bg-brand transition-all duration-300" style={{ width: `${value}%` }} />
    </div>
  );
}
