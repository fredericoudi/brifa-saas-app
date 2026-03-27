"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { UserProfile } from "@/lib/database.types";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

function mapLoginErrorMessage(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("fetch failed") ||
    normalized.includes("network request failed")
  ) {
    return "Falha de conexão com o Supabase. Verifique URL/chave no .env.local e confirme se o projeto está ativo.";
  }

  if (normalized.includes("invalid api key") || normalized.includes("apikey")) {
    return "Chave pública do Supabase inválida. Atualize NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou NEXT_PUBLIC_SUPABASE_ANON_KEY) no .env.local.";
  }

  return message;
}

export function LoginFormCard({
  title,
  description,
  next = "/",
  helperError,
  showSignupLink = true,
  signupHref = "/signup",
  forgotPasswordHref = "/forgot-password",
  style,
  variant = "card",
  formClassName,
  requireSuperAdmin = false,
  superAdminOnlyMessage = "Este acesso é exclusivo do super admin. Entre pelo portal da sua agência em /slug-da-agencia."
}: {
  title: string;
  description: string;
  next?: string;
  helperError?: string;
  showSignupLink?: boolean;
  signupHref?: string;
  forgotPasswordHref?: string;
  style?: React.CSSProperties;
  variant?: "card" | "bare";
  formClassName?: string;
  requireSuperAdmin?: boolean;
  superAdminOnlyMessage?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    try {
      setLoading(true);
      const supabase = createBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(mapLoginErrorMessage(signInError.message));
        return;
      }

      let destination = next;
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase.from("users").select("platform_role").eq("id", user.id).maybeSingle();
        const profile = data as Pick<UserProfile, "platform_role"> | null;

        if (requireSuperAdmin && profile?.platform_role !== "super_admin") {
          await supabase.auth.signOut();
          setError(superAdminOnlyMessage);
          return;
        }

        if (profile?.platform_role === "super_admin" && (next === "/" || next === "/dashboard")) {
          destination = "/platform";
        }
      }

      router.replace(destination);
      router.refresh();
    } catch (cause) {
      if (cause instanceof Error) {
        setError(mapLoginErrorMessage(cause.message));
      } else {
        setError("Não foi possível fazer login.");
      }
    } finally {
      setLoading(false);
    }
  }

  const form = (
    <>
      {variant === "card" ? (
        <>
          <CardHeader>
            <h1 className="text-[2rem] font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-xl text-sm leading-7 text-muted">{description}</p>
          </CardHeader>
          <CardContent>
            <form className={cn("space-y-4", formClassName)} onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">E-mail</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div>
                <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-muted">Senha</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              {helperError && !error ? (
                <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">{helperError}</p>
              ) : null}
              {error ? <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p> : null}

              <Button type="submit" className="mt-2 w-full" size="lg" disabled={loading}>
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>

            <div className="mt-5 flex items-center justify-between text-xs text-muted">
              <Link href={forgotPasswordHref} className="hover:text-brand">
                Esqueci minha senha
              </Link>
              {showSignupLink ? (
                <Link href={signupHref} className="hover:text-brand">
                  Criar conta
                </Link>
              ) : <span />}
            </div>
          </CardContent>
        </>
      ) : (
        <form className={cn("space-y-6", formClassName)} onSubmit={handleSubmit}>
          <div>
            <label className="mb-2 block text-sm font-medium text-text">E-mail</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-text">Senha</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          {helperError && !error ? (
            <p className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">{helperError}</p>
          ) : null}
          {error ? <p className="rounded-[18px] border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">{error}</p> : null}

          <Button type="submit" className="mt-2 w-full" size="lg" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="flex items-center justify-between text-xs text-muted">
            <Link href={forgotPasswordHref} className="hover:text-brand">
              Esqueci minha senha
            </Link>
            {showSignupLink ? (
              <Link href={signupHref} className="hover:text-brand">
                Criar conta
              </Link>
            ) : <span />}
          </div>
        </form>
      )}
    </>
  );

  if (variant === "bare") {
    return form;
  }

  return (
    <Card style={style}>
      {form}
    </Card>
  );
}
