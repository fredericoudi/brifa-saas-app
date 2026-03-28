"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function JobExitBar({ jobId, jobTitle }: { jobId: string; jobTitle: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleExit() {
    if (loading) return;

    const confirmed = window.confirm(`Registrar sua saída do job "${jobTitle}"?`);
    if (!confirmed) return;

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/jobs/${jobId}/exit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        setError(payload.error ?? "Não foi possível registrar a sua saída deste job.");
        return;
      }

      router.replace("/tasks");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar a sua saída deste job.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sticky bottom-4 z-30 mt-8">
      <div className="rounded-[28px] border border-border bg-white/95 px-4 py-4 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur">
        <div className="flex items-center justify-end">
          <Button type="button" size="lg" onClick={handleExit} disabled={loading}>
            {loading ? "Saindo..." : "Saída"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-xs text-rose-700">{error}</p> : null}
      </div>
    </div>
  );
}
