import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full rounded-[20px] border border-border bg-panel px-4 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] placeholder:text-muted focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_hsl(var(--brand)/0.08)]",
        className
      )}
      {...props}
    />
  );
});

Input.displayName = "Input";
