"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type TeamLoadItem = {
  id: string;
  name: string;
  activeHours: number;
  capacity: number;
  percent: number;
};

export function TeamLoadCardCarousel({
  highlightedLoad
}: {
  highlightedLoad: TeamLoadItem[];
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const totalMembers = highlightedLoad.length;

  const activeMember = useMemo(() => {
    if (totalMembers === 0) return null;
    return highlightedLoad[((activeIndex % totalMembers) + totalMembers) % totalMembers] ?? null;
  }, [activeIndex, highlightedLoad, totalMembers]);

  function goPrevious() {
    if (totalMembers <= 1) return;
    setActiveIndex((current) => (current - 1 + totalMembers) % totalMembers);
  }

  function goNext() {
    if (totalMembers <= 1) return;
    setActiveIndex((current) => (current + 1) % totalMembers);
  }

  return (
    <Card className="min-h-[308px] rounded-[28px] border-0 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.42)]">
      <CardHeader className="relative z-10 border-b-0 bg-panel shadow-[0_10px_14px_-14px_rgba(15,23,42,0.34)]">
        <h2 className="text-[1.35rem] font-semibold tracking-tight text-text">Carga da Equipe</h2>
      </CardHeader>
      <CardContent className="pt-4">
        {!activeMember ? (
          <p className="text-sm text-muted">Nenhum membro encontrado.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-text">{activeMember.name}</p>

              {totalMembers > 1 ? (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={goPrevious}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-panel text-muted transition hover:border-border hover:text-text"
                    aria-label="Ver membro anterior"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/80 bg-panel text-muted transition hover:border-border hover:text-text"
                    aria-label="Ver próximo membro"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex justify-center">
              <div
                className="grid h-40 w-40 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#56c7ee 0deg ${Math.max(activeMember.percent * 1.25, 40)}deg, hsl(var(--brand)) ${Math.max(
                    activeMember.percent * 1.25,
                    40
                  )}deg ${activeMember.percent * 3.6}deg, #e7eefc ${activeMember.percent * 3.6}deg 360deg)`
                }}
              >
                <div className="grid h-28 w-28 place-items-center rounded-full bg-panel">
                  <p className="text-[1.7rem] font-semibold tracking-tight text-text">{activeMember.percent}%</p>
                </div>
              </div>
            </div>

            <div className="space-y-1 text-center text-xs text-muted">
              <p>{activeMember.activeHours} horas planejadas</p>
              <p>{activeMember.capacity} horas de capacidade semanal</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
