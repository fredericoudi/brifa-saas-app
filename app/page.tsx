import { redirect } from "next/navigation";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { resolvePlatformPath } from "@/lib/agency-routing";
import { resolveProfileHomePath } from "@/lib/auth";
import type { UserProfile } from "@/lib/database.types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function resolveRouteErrorMessage(routeError: string | null) {
  return routeError === "agency_inactive"
    ? "Sua agência está inativa no momento. Fale com o administrador da plataforma."
    : routeError === "agency_suspended"
      ? "Sua agência está suspensa no momento. Fale com o administrador da plataforma."
      : routeError === "agency_not_found"
        ? "Não encontramos a agência vinculada a este acesso."
        : routeError === "profile_not_found"
          ? "Não encontramos o perfil desse usuário."
          : "";
}

export default async function HomePage({
  searchParams
}: {
  searchParams: { next?: string; error?: string };
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user) {
    const { data } = await supabase.from("users").select("platform_role, agency_id").eq("id", user.id).maybeSingle();
    const profile = data as Pick<UserProfile, "platform_role" | "agency_id"> | null;
    if (!profile) {
      redirect("/login?error=profile_not_found");
    }

    redirect(await resolveProfileHomePath(profile));
  }

  const helperError = resolveRouteErrorMessage(searchParams.error ?? null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 md:p-8">
      <BrifaFavicon />
      <div className="w-full max-w-5xl">
        <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
          <section className="surface-shell rounded-[36px] border border-border/80 px-6 py-8 shadow-panel md:px-8 md:py-10">
            <p className="text-sm uppercase tracking-[0.2em] text-muted">Entrada principal</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-text">Painel inicial do super admin</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
              Este é o acesso central do SaaS. Depois do login como super admin, você entra no painel com Dashboard,
              Agências e Configurar planos.
            </p>

            <div className="mt-8 rounded-[28px] border border-border bg-panelAlt/70 p-5">
              <p className="text-sm font-medium text-text">Acesso das agências</p>
              <p className="mt-2 text-sm leading-6 text-muted">
                O painel operacional de cada agência só será acessado pelo slug dela. Exemplo: <span className="font-mono font-semibold text-brand">/az3</span>.
              </p>
            </div>
          </section>

          <section className="flex items-center">
            <div className="w-full">
              <LoginFormCard
                title="Entrar como super admin"
                description="Acesse a central da plataforma para configurar planos, cadastrar agências e acompanhar o SaaS."
                next={resolvePlatformPath()}
                helperError={helperError}
                showSignupLink={false}
                requireSuperAdmin={true}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
