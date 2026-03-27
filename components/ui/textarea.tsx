import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "min-h-[120px] w-full rounded-[24px] border border-border bg-panel px-4 py-3 text-sm text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] placeholder:text-muted focus:border-brand focus:bg-white focus:shadow-[0_0_0_4px_hsl(var(--brand)/0.08)]",
          className
        )}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
