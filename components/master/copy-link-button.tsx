"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({
  value,
  label = "Copiar link",
  variant = "secondary"
}: {
  value: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={handleCopy}>
      {copied ? "Copiado" : label}
    </Button>
  );
}
