"use client";

import Image from "next/image";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type SidebarMode = "expanded" | "collapsed" | "hover";

const modeOptions: Array<{ value: SidebarMode; label: string; description: string }> = [
  {
    value: "expanded",
    label: "Expandida",
    description: "Mostra ícones e textos da navegação."
  },
  {
    value: "collapsed",
    label: "Recolhida",
    description: "Mostra apenas os ícones da navegação."
  },
  {
    value: "hover",
    label: "Expandir ao passar o mouse",
    description: "Fica recolhida e expande temporariamente no hover."
  }
];

export function SidebarModeControl({
  mode,
  onChange,
  compact = false
}: {
  mode: SidebarMode;
  onChange: (mode: SidebarMode) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={cn(
          "inline-flex items-center text-muted transition hover:text-text",
          compact
            ? "h-11 w-9 justify-center rounded-full px-0 text-xs hover:bg-panel"
            : "h-14 w-full justify-center gap-3 rounded-[16px] border border-border/70 bg-white px-4 text-[10.5px] font-medium hover:bg-white"
        )}
        onClick={() => setOpen((prev) => !prev)}
        title="Controle da barra lateral"
        aria-label="Controle da barra lateral"
      >
        <Image src="/icons/sidebar/controle-barra-lateral.svg" alt="" width={16} height={16} className="h-4 w-4 object-contain" />
        {compact ? null : <span>Controle da barra lateral</span>}
      </button>

      {open ? (
        <div className="absolute bottom-14 left-0 z-50 w-72 rounded-[20px] border border-border bg-panel p-2.5 shadow-panel">
          <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted">Barra lateral</p>
          <div className="space-y-1">
            {modeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "w-full rounded-[18px] px-3 py-3 text-left transition",
                  mode === option.value ? "bg-brandMuted text-text" : "hover:bg-panelAlt"
                )}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{option.label}</span>
                  {mode === option.value ? <Check className="h-4 w-4 text-brand" /> : null}
                </div>
                <p className="mt-1 text-xs text-muted">{option.description}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
