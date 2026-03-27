"use client";

import { Check, PanelLeft, PanelLeftClose, PanelLeftOpen } from "lucide-react";
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

function modeIcon(mode: SidebarMode) {
  if (mode === "expanded") return PanelLeftOpen;
  if (mode === "collapsed") return PanelLeftClose;
  return PanelLeft;
}

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
  const CurrentIcon = modeIcon(mode);

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
          "inline-flex h-11 items-center gap-2 rounded-[18px] border border-border bg-panelAlt/75 px-3 text-xs font-medium text-muted transition hover:bg-panelAlt hover:text-text",
          compact ? "w-9 justify-center px-0" : "w-full justify-start"
        )}
        onClick={() => setOpen((prev) => !prev)}
        title="Controle da barra lateral"
        aria-label="Controle da barra lateral"
      >
        <CurrentIcon className="h-4 w-4" />
        {compact ? null : <span>Controle da barra lateral</span>}
      </button>

      {open ? (
        <div className="absolute bottom-14 left-0 z-50 w-72 rounded-[24px] border border-border bg-panel p-2.5 shadow-panel">
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
