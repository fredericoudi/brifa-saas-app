"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function TrialActivationCard() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleActivateTrial() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/subscription/trial/activate", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            message?: string;
          }
        | null;

      if (!response.ok) {
        if (payload?.error === "TRIAL_ALREADY_ACTIVATED") {
          window.dispatchEvent(new Event("commercial-context:refresh"));
          router.refresh();
          return;
        }

        throw new Error(payload?.error ?? payload?.message ?? "Não foi possível liberar o acesso completo.");
      }

      window.dispatchEvent(new Event("commercial-context:refresh"));
      router.refresh();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Não foi possível liberar o acesso completo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="text-base font-semibold">💡 Quer testar o Brifa completo?</h2>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted">
          Libere todas as funcionalidades por 7 dias e veja sua agência rodando sem limites.
        </p>

        {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}

        <Button type="button" onClick={() => void handleActivateTrial()} disabled={loading}>
          {loading ? "Liberando acesso..." : "Liberar acesso completo por 7 dias"}
        </Button>
      </CardContent>
    </Card>
  );
}
