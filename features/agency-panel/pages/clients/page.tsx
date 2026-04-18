"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingBlock } from "@/components/ui/loading";
import type { Client, UserProfile } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type ClientForm = {
  id?: string;
  name: string;
  prefix: string;
  company: string;
  email: string;
  phone: string;
  notes: string;
};

const INITIAL_FORM: ClientForm = {
  name: "",
  prefix: "",
  company: "",
  email: "",
  phone: "",
  notes: ""
};

export default function ClientsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState<ClientForm>(INITIAL_FORM);
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalMessage, setLimitModalMessage] = useState("");
  const [limitModalTrialActivated, setLimitModalTrialActivated] = useState(false);
  const [activatingTrial, setActivatingTrial] = useState(false);

  const isEditing = useMemo(() => Boolean(form.id), [form.id]);

  async function loadData() {
    setError("");

    try {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Sessão expirada.");
        return;
      }

      const { data: currentProfile, error: profileError } = await supabase
        .from("users")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError || !currentProfile) {
        setError("Perfil não encontrado.");
        return;
      }

      setProfile(currentProfile);

      const { data: clientsData, error: clientsError } = await supabase
        .from("clients")
        .select("*")
        .eq("agency_id", currentProfile.agency_id)
        .order("created_at", { ascending: false });

      if (clientsError) {
        setError(clientsError.message);
        return;
      }

      setClients(clientsData ?? []);
    } catch {
      setError("Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function handleEdit(client: Client) {
    setForm({
      id: client.id,
      name: client.name,
      prefix: client.prefix ?? "",
      company: client.company ?? "",
      email: client.email ?? "",
      phone: client.phone ?? "",
      notes: client.notes ?? ""
    });
  }

  function resetForm() {
    setForm(INITIAL_FORM);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const supabase = createBrowserSupabaseClient();
      const payload = {
        agency_id: profile.agency_id,
        name: form.name,
        prefix: form.prefix.trim().toUpperCase() || null,
        company: form.company || null,
        email: form.email || null,
        phone: form.phone || null,
        notes: form.notes || null
      };

      if (form.id) {
        const { error: updateError } = await supabase.from("clients").update(payload).eq("id", form.id);
        if (updateError) throw updateError;
      } else {
        const response = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            prefix: form.prefix.trim().toUpperCase() || null,
            company: form.company || null,
            email: form.email || null,
            phone: form.phone || null,
            notes: form.notes || null
          })
        });

        const result = (await response.json().catch(() => null)) as
          | {
              error?: string;
              type?: string;
              message?: string;
              trialActivated?: boolean;
            }
          | null;

        if (!response.ok) {
          if (result?.error === "LIMIT_REACHED" && result.type === "CLIENT") {
            setLimitModalMessage(result.message ?? "Você atingiu o limite do plano Starter.");
            setLimitModalTrialActivated(Boolean(result.trialActivated));
            setLimitModalOpen(true);
            return;
          }

          throw new Error(result?.error ?? result?.message ?? "Falha ao salvar cliente.");
        }
      }

      resetForm();
      setSuccess(isEditing ? "Cliente atualizado com sucesso." : "Cliente criado com sucesso.");
      await loadData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(clientId: string) {
    if (!confirm("Deseja excluir este cliente?")) return;

    try {
      setError("");
      const supabase = createBrowserSupabaseClient();
      const { error: deleteError } = await supabase.from("clients").delete().eq("id", clientId);
      if (deleteError) throw deleteError;
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Falha ao excluir cliente.");
    }
  }

  async function handleActivateTrial() {
    try {
      setActivatingTrial(true);
      setError("");
      setSuccess("");

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
          setLimitModalTrialActivated(true);
          window.dispatchEvent(new Event("commercial-context:refresh"));
          return;
        }

        throw new Error(payload?.error ?? payload?.message ?? "Não foi possível liberar o acesso completo.");
      }

      window.dispatchEvent(new Event("commercial-context:refresh"));
      setLimitModalOpen(false);
      setSuccess("Acesso completo liberado por 7 dias. Aproveite para cadastrar clientes sem limite neste período.");
      await loadData();
    } catch (activateError) {
      setError(activateError instanceof Error ? activateError.message : "Não foi possível liberar o acesso completo.");
    } finally {
      setActivatingTrial(false);
    }
  }

  if (loading) return <LoadingBlock text="Carregando clientes..." />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">{isEditing ? "Editar cliente" : "Novo cliente"}</h2>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Nome</label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Empresa</label>
              <Input
                value={form.company}
                onChange={(e) => setForm((prev) => ({ ...prev, company: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Prefixo do cliente</label>
              <Input
                value={form.prefix}
                onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
                placeholder="Ex.: PIT"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">E-mail</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Telefone</label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-muted">Observações</label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              />
            </div>

            {error ? <p className="md:col-span-2 rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
            {success ? <p className="md:col-span-2 rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}

            <div className="md:col-span-2 flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Salvando..." : isEditing ? "Atualizar cliente" : "Criar cliente"}
              </Button>
              {isEditing ? (
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold">Lista de clientes</h2>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-sm text-muted">Nenhum cliente cadastrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th className="py-2">Nome</th>
                    <th className="py-2">Prefixo</th>
                    <th className="py-2">Empresa</th>
                    <th className="py-2">E-mail</th>
                    <th className="py-2">Telefone</th>
                    <th className="py-2 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-b border-border/70">
                      <td className="py-3 font-medium">{client.name}</td>
                      <td className="py-3 text-muted">{client.prefix || "-"}</td>
                      <td className="py-3 text-muted">{client.company || "-"}</td>
                      <td className="py-3 text-muted">{client.email || "-"}</td>
                      <td className="py-3 text-muted">{client.phone || "-"}</td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" onClick={() => handleEdit(client)}>
                            Editar
                          </Button>
                          <Button variant="danger" size="sm" onClick={() => handleDelete(client.id)}>
                            Excluir
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {limitModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-xl">
            <CardHeader>
              <h3 className="text-lg font-semibold text-text">🚀 Sua agência está crescendo!</h3>
            </CardHeader>
            <CardContent className="space-y-4">
              {limitModalTrialActivated ? (
                <>
                  <p className="text-sm text-text">
                    {limitModalMessage || "Você chegou no limite de 3 clientes."}
                  </p>
                  <p className="text-sm text-muted">
                    Desbloqueie clientes ilimitados para continuar crescendo.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-text">
                    Você chegou no limite de 3 clientes no plano Starter.
                  </p>
                  <p className="text-sm text-muted">
                    Libere acesso completo por 7 dias e continue crescendo sem limites.
                  </p>
                </>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button
                  onClick={() => {
                    if (limitModalTrialActivated) {
                      setLimitModalOpen(false);
                      router.push("/settings#assinatura");
                      return;
                    }

                    void handleActivateTrial();
                  }}
                  disabled={activatingTrial}
                >
                  {limitModalTrialActivated
                    ? "Desbloquear clientes ilimitados"
                    : activatingTrial
                      ? "Liberando acesso..."
                      : "Liberar acesso completo por 7 dias"}
                </Button>
                {!limitModalTrialActivated ? (
                  <Button variant="secondary" onClick={() => setLimitModalOpen(false)} disabled={activatingTrial}>
                    Continuar no plano gratuito
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
