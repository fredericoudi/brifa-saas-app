"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CopyLinkButton } from "@/components/master/copy-link-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { COMMERCIAL_STATUS_LABEL, type CommercialPlanCode, type CommercialSubscriptionStatus } from "@/lib/commercial";

type MasterAgencyFormValues = {
  name: string;
  slug: string;
  plan: CommercialPlanCode;
  status: CommercialSubscriptionStatus;
  adminEmail: string;
  adminName: string;
  trialStartsAt: string;
  trialEndsAt: string;
};

export function MasterAgencyForm({
  mode,
  agencyId,
  initialValues,
  initialActivationLink,
  planOptions
}: {
  mode: "create" | "edit";
  agencyId?: string;
  initialValues: MasterAgencyFormValues;
  initialActivationLink?: string | null;
  planOptions: Array<{ code: CommercialPlanCode; name: string }>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [activationLink, setActivationLink] = useState(initialActivationLink ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isCreate = mode === "create";
  const endpoint = useMemo(() => (isCreate ? "/api/master/agencies" : `/api/master/agencies/${agencyId}`), [agencyId, isCreate]);

  function updateValue<K extends keyof MasterAgencyFormValues>(key: K, value: MasterAgencyFormValues[K]) {
    setValues((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function submit(regenerateActivationLink = false) {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const response = await fetch(endpoint, {
        method: isCreate ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          trialStartsAt: values.trialStartsAt || null,
          trialEndsAt: values.trialEndsAt || null,
          adminName: values.adminName || null,
          adminEmail: values.adminEmail || null,
          regenerateActivationLink
        })
      });

      const payload = (await response.json()) as {
        error?: string;
        activationLink?: string | null;
        agency?: { id: string };
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar a agência.");
      }

      if (payload.activationLink) {
        setActivationLink(payload.activationLink);
      }

      setSuccess(
        regenerateActivationLink
          ? "Novo link de ativação gerado com sucesso."
          : isCreate
            ? "Agência cadastrada com sucesso."
            : "Agência atualizada com sucesso."
      );

      router.refresh();

      if (isCreate && payload.agency?.id) {
        router.push(resolvePlatformPath(`/agencies/${payload.agency.id}`));
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível salvar a agência.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Nome da agência</label>
          <Input value={values.name} onChange={(event) => updateValue("name", event.target.value)} required />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Slug</label>
          <Input
            value={values.slug}
            onChange={(event) => updateValue("slug", event.target.value)}
            placeholder="ex.: az3-comunicacao"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Plano comercial</label>
          <Select value={values.plan} onChange={(event) => updateValue("plan", event.target.value as CommercialPlanCode)}>
            {planOptions.map((plan) => (
              <option key={plan.code} value={plan.code}>
                {plan.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Status da assinatura</label>
          <Select
            value={values.status}
            onChange={(event) => updateValue("status", event.target.value as CommercialSubscriptionStatus)}
          >
            {Object.entries(COMMERCIAL_STATUS_LABEL)
              .filter(([value]) => value !== "trial_expired")
              .map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
              ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">E-mail do admin inicial</label>
          <Input
            type="email"
            value={values.adminEmail}
            onChange={(event) => updateValue("adminEmail", event.target.value)}
            required={isCreate}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Nome do admin inicial</label>
          <Input value={values.adminName} onChange={(event) => updateValue("adminName", event.target.value)} />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Início do trial</label>
          <Input
            type="date"
            value={values.trialStartsAt}
            onChange={(event) => updateValue("trialStartsAt", event.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Fim do trial</label>
          <Input type="date" value={values.trialEndsAt} onChange={(event) => updateValue("trialEndsAt", event.target.value)} />
        </div>
      </div>

      {activationLink ? (
        <div className="rounded-2xl border border-border bg-panelAlt/60 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Link de ativação</p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input value={activationLink} readOnly className="font-mono text-xs" />
            <CopyLinkButton value={activationLink} />
          </div>
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={saving} onClick={() => void submit(false)}>
          {saving ? "Salvando..." : isCreate ? "Cadastrar agência" : "Salvar alterações"}
        </Button>

        {!isCreate ? (
          <Button type="button" variant="secondary" disabled={saving} onClick={() => void submit(true)}>
            {saving ? "Processando..." : "Gerar novo link de ativação"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
