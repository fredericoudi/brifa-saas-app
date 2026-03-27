"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function AgencyActivationForm({
  agencySlug,
  token,
  email
}: {
  agencySlug: string;
  token: string;
  email: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    try {
      setLoading(true);

      const response = await fetch("/api/agency-activation/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agency: agencySlug,
          token,
          name,
          password,
          confirmPassword
        })
      });

      const payload = (await response.json()) as { error?: string; email?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível ativar a agência.");
      }

      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: payload.email ?? email,
        password
      });

      if (signInError) {
        setSuccess("Agência ativada com sucesso. Faça login para continuar.");
        router.push(`/${agencySlug}`);
        return;
      }

      router.replace("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Não foi possível concluir a ativação.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1 block text-xs font-medium text-muted">E-mail</label>
        <Input type="email" value={email} readOnly />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Nome do administrador</label>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Senha</label>
        <Input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={6}
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted">Confirmar senha</label>
        <Input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={6}
        />
      </div>

      {error ? <p className="rounded-xl bg-rose-100 px-3 py-2 text-xs text-rose-700">{error}</p> : null}
      {success ? <p className="rounded-xl bg-emerald-100 px-3 py-2 text-xs text-emerald-700">{success}</p> : null}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Ativando..." : "Ativar agência"}
      </Button>
    </form>
  );
}
