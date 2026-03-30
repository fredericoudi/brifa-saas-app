"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function AgencyStatusToggleButton({
  agency
}: {
  agency: {
    id: string;
    status: "active" | "inactive" | "suspended" | "trial" | "pending_payment";
  };
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const nextStatus =
    agency.status === "active" || agency.status === "trial" || agency.status === "pending_payment" ? "inactive" : "active";

  async function handleToggle() {
    try {
      setLoading(true);
      const response = await fetch(`/api/master/agencies/${agency.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: nextStatus
        })
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível atualizar o status da agência.");
      }

      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Não foi possível atualizar o status da agência.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={handleToggle}>
      {loading ? "Atualizando..." : nextStatus === "inactive" ? "Desativar painel" : "Ativar painel"}
    </Button>
  );
}
