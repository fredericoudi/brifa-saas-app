import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-brand text-white shadow-[0_18px_30px_-22px_hsl(var(--brand)/0.9)] hover:-translate-y-0.5 hover:brightness-[1.03]",
  secondary: "border border-border bg-panel text-text hover:bg-panelAlt/80",
  ghost: "border border-transparent bg-panelAlt/70 text-text hover:bg-panelAlt",
  danger: "border border-rose-200 bg-rose-50 text-danger hover:bg-rose-100"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3.5 text-xs",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-sm"
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-full font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-60",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";
