"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import loginBackground from "@/images/login_bg.webp";
import logoBrifa from "@/images/logo_brifa.svg";
import { PUBLIC_SIGNUP_PLAN_LABEL, type PublicSignupPlanSlug } from "@/lib/commercial-signup";
import { normalizeAgencySlug } from "@/lib/master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type SignupPlanOption = {
  slug: PublicSignupPlanSlug;
  label: string;
  priceLabel: string;
  highlight: string;
};

const PLAN_OPTIONS: SignupPlanOption[] = [
  { slug: "start", label: "Start", priceLabel: "R$ 49/mês", highlight: "Ideal para começar com a agência enxuta." },
  { slug: "pro", label: "Pro", priceLabel: "R$ 99/mês", highlight: "Mais equipe, mais automação e IA habilitada." },
  { slug: "business", label: "Business", priceLabel: "R$ 199/mês", highlight: "Operação completa para a agência toda." }
];

export function PublicSignupForm({
  initialPlan,
  checkoutStatus
}: {
  initialPlan: PublicSignupPlanSlug;
  checkoutStatus?: "processing" | "canceled" | null;
}) {
  const [agencyName, setAgencyName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [plan, setPlan] = useState<PublicSignupPlanSlug>(initialPlan);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = useMemo(
    () => PLAN_OPTIONS.find((option) => option.slug === plan) ?? PLAN_OPTIONS[0],
    [plan]
  );

  const slugPreview = normalizeAgencySlug(slug);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      setLoading(true);

      const response = await fetch("/api/commercial/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agencyName,
          slug,
          ownerName,
          ownerEmail,
          ownerPhone,
          plan,
          acceptTerms
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string; checkoutUrl?: string } | null;

      if (!response.ok || !payload?.checkoutUrl) {
        throw new Error(payload?.error ?? "Não foi possível iniciar a contratação.");
      }

      window.location.href = payload.checkoutUrl;
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível iniciar a contratação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex min-h-screen bg-white">
          <div className="flex w-full flex-col px-8 py-8 sm:px-12 lg:px-14 xl:px-16">
            <div className="flex items-center justify-between gap-6">
              <div className="flex h-[28px] items-center">
                <Image src={logoBrifa} alt="Brifa" priority className="h-auto w-[100px]" />
              </div>

              <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-brand">
                Voltar para a landing
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-1 items-center justify-center py-10">
              <div className="w-full max-w-[560px] space-y-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center rounded-full border border-border bg-panelAlt px-4 py-2 text-sm font-medium text-brand">
                    Plano selecionado: {PUBLIC_SIGNUP_PLAN_LABEL[plan]}
                  </div>
                  <div>
                    <h1 className="text-[3rem] font-semibold tracking-tight text-text">Começar contratação</h1>
                    <p className="mt-4 text-lg leading-8 text-muted">
                      Cadastre a agência, confirme o plano e siga para a cobrança recorrente do BRIFA.
                    </p>
                  </div>
                </div>

                {checkoutStatus === "processing" ? (
                  <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
                    Recebemos o retorno do checkout. Assim que a Asaas confirmar o pagamento, vamos liberar a agência e enviar o
                    e-mail com o link do painel.
                  </div>
                ) : null}

                {checkoutStatus === "canceled" ? (
                  <div className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-700">
                    O checkout foi interrompido antes da conclusão. Você pode revisar os dados e tentar novamente.
                  </div>
                ) : null}

                <div className="grid gap-3 md:grid-cols-3">
                  {PLAN_OPTIONS.map((option) => {
                    const active = option.slug === plan;
                    return (
                      <button
                        key={option.slug}
                        type="button"
                        onClick={() => setPlan(option.slug)}
                        className={`rounded-[28px] border p-4 text-left transition ${
                          active ? "border-brand bg-brand/5 shadow-sm" : "border-border bg-white hover:border-brand/40"
                        }`}
                      >
                        <p className="text-sm font-medium text-text">{option.label}</p>
                        <p className="mt-2 text-xl font-semibold text-text">{option.priceLabel}</p>
                        <p className="mt-2 text-xs leading-5 text-muted">{option.highlight}</p>
                      </button>
                    );
                  })}
                </div>

                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-text">Nome da agência</label>
                      <Input value={agencyName} onChange={(event) => setAgencyName(event.target.value)} required />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-text">Slug do portal</label>
                      <Input
                        value={slug}
                        onChange={(event) => setSlug(event.target.value)}
                        placeholder="az3"
                        required
                      />
                      <p className="mt-2 text-xs text-muted">Endereço do painel: brifa.app/app/{slugPreview || "sua-agencia"}</p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-text">Nome do responsável</label>
                      <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} required />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-text">E-mail do responsável</label>
                      <Input type="email" value={ownerEmail} onChange={(event) => setOwnerEmail(event.target.value)} required />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-text">Telefone / WhatsApp</label>
                      <Input
                        value={ownerPhone}
                        onChange={(event) => setOwnerPhone(event.target.value)}
                        placeholder="5511999999999"
                        required
                      />
                    </div>
                  </div>

                  <label className="flex items-start gap-3 rounded-[24px] border border-border bg-panelAlt/40 px-4 py-4 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(event) => setAcceptTerms(event.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-border text-brand focus:ring-brand"
                    />
                    <span>
                      Confirmo que posso contratar o BRIFA para esta agência e aceito prosseguir para a cobrança recorrente do plano
                      selecionado.
                    </span>
                  </label>

                  {error ? <p className="rounded-[20px] bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

                  <Button type="submit" className="h-14 w-full rounded-[24px] text-base" disabled={loading}>
                    {loading ? "Abrindo checkout..." : "Ir para pagamento"}
                  </Button>
                </form>
              </div>
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-screen lg:block">
          <Image src={loginBackground} alt="Visual premium do BRIFA" fill priority className="object-cover" />
        </section>
      </div>
    </div>
  );
}
