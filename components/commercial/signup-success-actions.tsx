"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function SignupSuccessActions({
  agencySlug,
  portalPath
}: {
  agencySlug?: string | null;
  portalPath?: string | null;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleResend() {
    if (!agencySlug || isSubmitting) return;

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/commercial/resend-onboarding", {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify({
          agencySlug
        })
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("O BRIFA recebeu uma resposta inesperada ao tentar reenviar o acesso.");
      }

      const payload = (await response.json().catch(() => null)) as { error?: string; email?: string; ok?: boolean } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Não foi possível reenviar o e-mail de ativação.");
      }

      setFeedback({
        type: "success",
        text: payload?.email
          ? `Reenviamos o e-mail de ativação para ${payload.email}.`
          : "Reenviamos o e-mail de ativação com sucesso."
      });
    } catch (error) {
      setFeedback({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível reenviar o e-mail de ativação."
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-center gap-3">
        {portalPath ? (
          <Link
            href={portalPath}
            className="inline-flex h-12 items-center justify-center rounded-[18px] border border-border bg-panel px-5 text-sm font-medium text-text transition hover:bg-panelAlt/80"
          >
            Abrir portal da agência
          </Link>
        ) : null}
        <Button type="button" size="lg" onClick={handleResend} disabled={!agencySlug || isSubmitting}>
          {isSubmitting ? "Reenviando..." : "Reenviar e-mail de ativação"}
        </Button>
      </div>

      {feedback ? (
        <div
          className={
            feedback.type === "success"
              ? "rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm text-emerald-700"
              : "rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm text-rose-700"
          }
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}
