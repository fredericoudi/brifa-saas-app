import * as React from "react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "h-12 w-full rounded-[20px] border border-border bg-panel px-4 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_hsl(var(--brand)/0.08)]",
        className
      )}
      {...props}
    />
  );
});

Select.displayName = "Select";
