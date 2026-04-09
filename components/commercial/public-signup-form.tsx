"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { formatPostalCode, normalizePostalCode } from "@/lib/brazil";
import loginBackground from "@/images/login_bg.webp";
import logoBrifa from "@/images/logo_brifa.png";
import {
  DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS,
  isPublicSignupPlanSlug,
  type PublicSignupPlanOption,
  type PublicSignupPlanSlug
} from "@/lib/commercial-signup";
import { normalizeAgencySlug } from "@/lib/master";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const SIGNUP_DRAFT_STORAGE_KEY = "brifa-public-signup-draft";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
});

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizePlanOption(input: Partial<PublicSignupPlanOption>): PublicSignupPlanOption | null {
  if (!isPublicSignupPlanSlug(input.slug ?? "")) {
    return null;
  }

  const fallback = DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS.find((option) => option.slug === input.slug);
  if (!fallback) {
    return null;
  }

  const normalizedPrice = Number.isFinite(input.priceCents) ? Math.max(0, Math.round(input.priceCents ?? 0)) : fallback.priceCents;

  return {
    slug: input.slug,
    label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : fallback.label,
    highlight: typeof input.highlight === "string" && input.highlight.trim() ? input.highlight.trim() : fallback.highlight,
    priceCents: normalizedPrice,
    priceLabel:
      typeof input.priceLabel === "string" && input.priceLabel.trim()
        ? input.priceLabel.trim()
        : currencyFormatter.format(normalizedPrice / 100).concat("/mês")
  };
}

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
  const [ownerDocument, setOwnerDocument] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingAddress, setBillingAddress] = useState("");
  const [billingAddressNumber, setBillingAddressNumber] = useState("");
  const [billingComplement, setBillingComplement] = useState("");
  const [billingProvince, setBillingProvince] = useState("");
  const [billingCityName, setBillingCityName] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingCityCode, setBillingCityCode] = useState<number | null>(null);
  const [zipLookupLoading, setZipLookupLoading] = useState(false);
  const [zipLookupError, setZipLookupError] = useState("");
  const [plan, setPlan] = useState<PublicSignupPlanSlug>(initialPlan);
  const [planOptions, setPlanOptions] = useState<PublicSignupPlanOption[]>(DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [reviewStep, setReviewStep] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const selectedPlan = useMemo(
    () => planOptions.find((option) => option.slug === plan) ?? planOptions[0] ?? DEFAULT_PUBLIC_SIGNUP_PLAN_OPTIONS[0],
    [plan, planOptions]
  );

  const slugPreview = normalizeAgencySlug(slug);
  const firstBillingDate = useMemo(() => dateFormatter.format(addMonths(new Date(), 1)), []);
  const formattedMonthlyPrice = useMemo(() => currencyFormatter.format(selectedPlan.priceCents / 100), [selectedPlan.priceCents]);

  useEffect(() => {
    let active = true;

    async function loadPlanOptions() {
      try {
        const response = await fetch("/api/commercial/plans", { cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as
          | { plans?: Partial<PublicSignupPlanOption>[] }
          | null;

        if (!response.ok || !payload?.plans?.length) {
          return;
        }

        const remotePlans = payload.plans.map(normalizePlanOption).filter((option): option is PublicSignupPlanOption => option != null);
        if (!remotePlans.length || !active) {
          return;
        }

        setPlanOptions(remotePlans);
      } catch {
        // Mantém fallback local para não bloquear a contratação.
      }
    }

    void loadPlanOptions();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (planOptions.some((option) => option.slug === plan)) {
      return;
    }

    setPlan(planOptions[0]?.slug ?? initialPlan);
  }, [initialPlan, plan, planOptions]);

  useEffect(() => {
    const rawDraft = window.localStorage.getItem(SIGNUP_DRAFT_STORAGE_KEY);
    if (!rawDraft) {
      return;
    }

    try {
      const draft = JSON.parse(rawDraft) as Partial<{
        agencyName: string;
        slug: string;
        ownerName: string;
        ownerEmail: string;
        ownerDocument: string;
        ownerPhone: string;
        billingPostalCode: string;
        billingAddress: string;
        billingAddressNumber: string;
        billingComplement: string;
        billingProvince: string;
        billingCityName: string;
        billingState: string;
        billingCityCode: number | null;
        plan: PublicSignupPlanSlug;
        acceptTerms: boolean;
      }>;

      if (typeof draft.agencyName === "string") setAgencyName(draft.agencyName);
      if (typeof draft.slug === "string") setSlug(draft.slug);
      if (typeof draft.ownerName === "string") setOwnerName(draft.ownerName);
      if (typeof draft.ownerEmail === "string") setOwnerEmail(draft.ownerEmail);
      if (typeof draft.ownerDocument === "string") setOwnerDocument(draft.ownerDocument);
      if (typeof draft.ownerPhone === "string") setOwnerPhone(draft.ownerPhone);
      if (typeof draft.billingPostalCode === "string") setBillingPostalCode(draft.billingPostalCode);
      if (typeof draft.billingAddress === "string") setBillingAddress(draft.billingAddress);
      if (typeof draft.billingAddressNumber === "string") setBillingAddressNumber(draft.billingAddressNumber);
      if (typeof draft.billingComplement === "string") setBillingComplement(draft.billingComplement);
      if (typeof draft.billingProvince === "string") setBillingProvince(draft.billingProvince);
      if (typeof draft.billingCityName === "string") setBillingCityName(draft.billingCityName);
      if (typeof draft.billingState === "string") setBillingState(draft.billingState);
      if (typeof draft.billingCityCode === "number") setBillingCityCode(draft.billingCityCode);
      if (isPublicSignupPlanSlug(draft.plan ?? "")) setPlan(draft.plan);
      if (typeof draft.acceptTerms === "boolean") setAcceptTerms(draft.acceptTerms);
    } catch {
      window.localStorage.removeItem(SIGNUP_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SIGNUP_DRAFT_STORAGE_KEY,
      JSON.stringify({
        agencyName,
        slug,
        ownerName,
        ownerEmail,
        ownerDocument,
        ownerPhone,
        billingPostalCode,
        billingAddress,
        billingAddressNumber,
        billingComplement,
        billingProvince,
        billingCityName,
        billingState,
        billingCityCode,
        plan,
        acceptTerms
      })
    );
  }, [
    acceptTerms,
    agencyName,
    billingAddress,
    billingAddressNumber,
    billingCityCode,
    billingCityName,
    billingComplement,
    billingPostalCode,
    billingProvince,
    billingState,
    ownerDocument,
    ownerEmail,
    ownerName,
    ownerPhone,
    plan,
    slug
  ]);

  useEffect(() => {
    const postalCode = normalizePostalCode(billingPostalCode);

    if (postalCode.length !== 8) {
      setZipLookupError("");
      return;
    }

    let active = true;

    async function lookupPostalCode() {
      try {
        setZipLookupLoading(true);
        setZipLookupError("");

        const response = await fetch(`/api/address/zipcode?postalCode=${postalCode}`);
        const payload = (await response.json().catch(() => null)) as
          | {
              error?: string;
              address?: string;
              complement?: string;
              province?: string;
              cityName?: string;
              state?: string;
              cityCode?: number;
            }
          | null;

        if (!response.ok || !payload) {
          throw new Error(payload?.error ?? "Não foi possível consultar o CEP.");
        }

        if (!active) {
          return;
        }

        setBillingAddress(payload.address ?? "");
        setBillingProvince(payload.province ?? "");
        setBillingCityName(payload.cityName ?? "");
        setBillingState(payload.state ?? "");
        setBillingCityCode(typeof payload.cityCode === "number" ? payload.cityCode : null);

        if (!billingComplement && payload.complement) {
          setBillingComplement(payload.complement);
        }
      } catch (lookupError) {
        if (!active) {
          return;
        }

        setBillingCityCode(null);
        setZipLookupError(lookupError instanceof Error ? lookupError.message : "Não foi possível consultar o CEP.");
      } finally {
        if (active) {
          setZipLookupLoading(false);
        }
      }
    }

    void lookupPostalCode();

    return () => {
      active = false;
    };
  }, [billingComplement, billingPostalCode]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!reviewStep) {
      if (!acceptTerms) {
        setError("Confirme o aceite para revisar a contratação.");
        return;
      }

      setReviewStep(true);
      return;
    }

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
          ownerDocument,
          ownerPhone,
          billingPostalCode,
          billingAddress,
          billingAddressNumber,
          billingComplement,
          billingProvince,
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
                    Plano selecionado: {selectedPlan.label}
                  </div>
                  <div>
                    <h1 className="text-[3rem] font-semibold tracking-tight text-text">Começar contratação</h1>
                    <p className="mt-4 text-lg leading-8 text-muted">
                      Cadastre a agência, revise o teste grátis e só depois siga para o checkout do BRIFA.
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
                  {planOptions.map((option) => {
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
                        placeholder="suaagencia"
                        required
                      />
                      <p className="mt-2 text-xs text-muted">Endereço do painel: brifa.app/app/{slugPreview || "suaagencia"}</p>
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
                      <label className="mb-2 block text-sm font-medium text-text">CPF/CNPJ do responsável</label>
                      <Input
                        value={ownerDocument}
                        onChange={(event) => setOwnerDocument(event.target.value)}
                        placeholder="12345678901 ou 12345678000199"
                        required
                      />
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

                    <div className="md:col-span-2 rounded-[28px] border border-border bg-panelAlt/35 p-4">
                      <div className="mb-4">
                        <p className="text-sm font-semibold text-text">Dados de cobrança</p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Esses dados serão enviados ao checkout do Asaas para abrir com identificação e endereço já preenchidos.
                        </p>
                      </div>

                      <div className="grid gap-5 md:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">CEP</label>
                          <Input
                            value={formatPostalCode(billingPostalCode)}
                            onChange={(event) => setBillingPostalCode(event.target.value)}
                            placeholder="00000-000"
                            required
                          />
                          {zipLookupLoading ? <p className="mt-2 text-xs text-muted">Consultando CEP...</p> : null}
                          {zipLookupError ? <p className="mt-2 text-xs text-rose-600">{zipLookupError}</p> : null}
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">Número</label>
                          <Input
                            value={billingAddressNumber}
                            onChange={(event) => setBillingAddressNumber(event.target.value)}
                            placeholder="123"
                            required
                          />
                        </div>

                        <div className="md:col-span-2">
                          <label className="mb-2 block text-sm font-medium text-text">Endereço</label>
                          <Input
                            value={billingAddress}
                            onChange={(event) => setBillingAddress(event.target.value)}
                            placeholder="Rua, avenida, praça..."
                            required
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">Bairro</label>
                          <Input
                            value={billingProvince}
                            onChange={(event) => setBillingProvince(event.target.value)}
                            placeholder="Centro"
                            required
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">Complemento</label>
                          <Input
                            value={billingComplement}
                            onChange={(event) => setBillingComplement(event.target.value)}
                            placeholder="Apto 301"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">Cidade</label>
                          <Input
                            value={billingCityName}
                            onChange={(event) => setBillingCityName(event.target.value)}
                            placeholder="Digite a cidade"
                          />
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-medium text-text">UF</label>
                          <Input
                            value={billingState}
                            onChange={(event) => setBillingState(event.target.value.toUpperCase().slice(0, 2))}
                            placeholder="UF"
                          />
                        </div>
                      </div>
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

                  {reviewStep ? (
                    <div className="rounded-[28px] border border-brand/15 bg-[linear-gradient(180deg,rgba(67,97,238,0.05),rgba(67,97,238,0.01))] p-5 shadow-[0_18px_50px_-40px_rgba(67,97,238,0.55)]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Revisão Comercial</p>
                          <h2 className="mt-2 text-2xl font-semibold text-text">Seu primeiro mês está liberado</h2>
                          <p className="mt-2 max-w-[38rem] text-sm leading-6 text-muted">
                            Hoje você só confirma a assinatura. A primeira cobrança do plano {selectedPlan.label} acontece em{" "}
                            <span className="font-semibold text-text">{firstBillingDate}</span>.
                          </p>
                        </div>

                        <div className="rounded-[24px] border border-brand/15 bg-white/90 px-4 py-3 text-right shadow-[0_14px_32px_-28px_rgba(15,23,42,0.55)]">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Hoje</p>
                          <p className="mt-1 text-3xl font-semibold text-text">R$ 0,00</p>
                          <p className="mt-1 text-sm text-muted">
                            Depois: <span className="line-through">{formattedMonthlyPrice}</span>{" "}
                            <span className="font-semibold text-brand">{formattedMonthlyPrice}/mês</span>
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-[22px] border border-border bg-white/90 px-4 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Cobrança de hoje</p>
                          <p className="mt-2 text-lg font-semibold text-text">R$ 0,00</p>
                          <p className="mt-1 text-sm text-muted">Nenhum valor deve ser cobrado agora.</p>
                        </div>

                        <div className="rounded-[22px] border border-border bg-white/90 px-4 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Primeira cobrança</p>
                          <p className="mt-2 text-lg font-semibold text-text">{firstBillingDate}</p>
                          <p className="mt-1 text-sm text-muted">A partir dessa data, segue a recorrência mensal.</p>
                        </div>

                        <div className="rounded-[22px] border border-border bg-white/90 px-4 py-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Plano</p>
                          <p className="mt-2 text-lg font-semibold text-text">{selectedPlan.label}</p>
                          <p className="mt-1 text-sm text-muted">{formattedMonthlyPrice}/mês após o teste grátis.</p>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        Se o checkout do Asaas continuar mostrando o valor cheio, considere esse resumo como a regra comercial válida do
                        BRIFA: <span className="font-semibold">hoje é R$ 0,00 e a primeira cobrança só acontece em {firstBillingDate}</span>.
                      </div>
                    </div>
                  ) : null}

                  {error ? <p className="rounded-[20px] bg-rose-100 px-4 py-3 text-sm text-rose-700">{error}</p> : null}

                  <div className="flex flex-col gap-3 sm:flex-row">
                    {reviewStep ? (
                      <Button
                        type="button"
                        variant="secondary"
                        className="h-14 rounded-[24px] text-base sm:flex-1"
                        onClick={() => {
                          setReviewStep(false);
                          setError("");
                        }}
                        disabled={loading}
                      >
                        Voltar e editar
                      </Button>
                    ) : null}

                    <Button type="submit" className="h-14 rounded-[24px] text-base sm:flex-1" disabled={loading}>
                      {loading
                        ? "Abrindo checkout..."
                        : reviewStep
                          ? "Continuar com 1º mês grátis"
                          : "Revisar contratação"}
                    </Button>
                  </div>
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
