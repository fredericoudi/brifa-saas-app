"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Plan } from "@/lib/database.types";
import { formatPlanLimit } from "@/lib/commercial";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type EditablePlan = Pick<
  Plan,
  "id" | "name" | "code" | "price_monthly" | "max_users" | "max_jobs" | "ai_briefing_enabled" | "google_drive_enabled" | "active"
>;

export function PlatformPlansManager({ plans }: { plans: EditablePlan[] }) {
  const router = useRouter();
  const [priceValues, setPriceValues] = useState<Record<string, string>>(
    Object.fromEntries(plans.map((plan) => [plan.id, Number(plan.price_monthly ?? 0).toFixed(2)]))
  );
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, { type: "success" | "error"; message: string }>>({});

  const hasPlans = useMemo(() => plans.length > 0, [plans.length]);

  async function handleSave(planId: string) {
    const rawValue = priceValues[planId]?.replace(",", ".") ?? "";
    const parsedValue = Number(rawValue);

    if (!rawValue || Number.isNaN(parsedValue) || parsedValue < 0) {
      setFeedback((current) => ({
        ...current,
        [planId]: { type: "error", message: "Informe um valor mensal válido." }
      }));
      return;
    }

    try {
      setSavingPlanId(planId);
      setFeedback((current) => {
        const next = { ...current };
        delete next[planId];
        return next;
      });

      const response = await fetch(`/api/master/plans/${planId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: parsedValue })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível atualizar o valor do plano.");
      }

      setPriceValues((current) => ({
        ...current,
        [planId]: parsedValue.toFixed(2)
      }));
      setFeedback((current) => ({
        ...current,
        [planId]: { type: "success", message: "Valor atualizado com sucesso." }
      }));
      router.refresh();
    } catch (error) {
      setFeedback((current) => ({
        ...current,
        [planId]: {
          type: "error",
          message: error instanceof Error ? error.message : "Não foi possível atualizar o valor do plano."
        }
      }));
    } finally {
      setSavingPlanId(null);
    }
  }

  if (!hasPlans) {
    return <p className="text-sm text-muted">Nenhum plano comercial disponível.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-[1080px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th className="py-2">Plano</th>
            <th className="py-2">Código</th>
            <th className="py-2">Mensalidade</th>
            <th className="py-2">Usuários</th>
            <th className="py-2">Jobs</th>
            <th className="py-2">IA</th>
            <th className="py-2">Google Drive</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Ação</th>
          </tr>
        </thead>
        <tbody>
          {plans.map((plan) => {
            const message = feedback[plan.id];
            const saving = savingPlanId === plan.id;

            return (
              <tr key={plan.id} className="border-b border-border/70 align-top">
                <td className="py-3 font-medium text-text">{plan.name}</td>
                <td className="py-3 text-muted">{plan.code}</td>
                <td className="py-3">
                  <div className="max-w-[170px] space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted">R$</span>
                      <Input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={priceValues[plan.id] ?? ""}
                        onChange={(event) =>
                          setPriceValues((current) => ({
                            ...current,
                            [plan.id]: event.target.value
                          }))
                        }
                      />
                    </div>
                    {message ? (
                      <p className={message.type === "success" ? "text-xs text-emerald-700" : "text-xs text-rose-700"}>
                        {message.message}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 text-muted">{formatPlanLimit(plan.max_users)}</td>
                <td className="py-3 text-muted">{formatPlanLimit(plan.max_jobs)}</td>
                <td className="py-3">
                  <Badge variant={plan.ai_briefing_enabled ? "success" : "neutral"}>
                    {plan.ai_briefing_enabled ? "Habilitada" : "Indisponível"}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge variant={plan.google_drive_enabled ? "success" : "neutral"}>
                    {plan.google_drive_enabled ? "Habilitado" : "Indisponível"}
                  </Badge>
                </td>
                <td className="py-3">
                  <Badge variant={plan.active ? "success" : "neutral"}>{plan.active ? "Ativo" : "Inativo"}</Badge>
                </td>
                <td className="py-3 text-right">
                  <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave(plan.id)}>
                    {saving ? "Salvando..." : "Salvar valor"}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
