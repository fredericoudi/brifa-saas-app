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
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2 lg:bottom-6 lg:right-6">
      {error ? (
        <p className="max-w-[320px] rounded-2xl border border-rose-200 bg-white/95 px-4 py-3 text-xs text-rose-700 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.45)] backdrop-blur">
          {error}
        </p>
      ) : null}
      <Button type="button" size="lg" onClick={handleExit} disabled={loading} className="min-w-[160px] shadow-panel">
        {loading ? "Saindo..." : "Saída"}
      </Button>
    </div>
  );
}
