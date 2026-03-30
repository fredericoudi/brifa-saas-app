import { redirect } from "next/navigation";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { resolveAgencyAppPath, resolvePlatformPath } from "@/lib/agency-routing";
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

export default async function PlatformLoginPage({
  searchParams
}: {
  searchParams: { next?: string; error?: string };
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const next = searchParams.next?.trim() || resolvePlatformPath();

  if (user) {
    const { data } = await supabase.from("users").select("platform_role, agency_id").eq("id", user.id).maybeSingle();
    const profile = data as Pick<UserProfile, "platform_role" | "agency_id"> | null;

    if (profile?.platform_role === "super_admin") {
      redirect(next);
    }

    if (profile?.agency_id) {
      const { data: agency } = await supabase.from("agencies").select("slug").eq("id", profile.agency_id).maybeSingle();
      redirect(resolveAgencyAppPath(agency?.slug ?? null) ?? "/dashboard");
    }

    redirect("/dashboard");
  }

  const helperError = resolveRouteErrorMessage(searchParams.error ?? null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4 md:p-8">
      <BrifaFavicon />
      <div className="w-full max-w-xl">
        <div className="surface-shell rounded-[36px] border border-border/80 px-6 py-8 shadow-panel md:px-8 md:py-10">
          <p className="text-sm uppercase tracking-[0.2em] text-muted">Plataforma</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-text">Entrar no painel master</h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
            Acesse o painel da plataforma para gerenciar agências, planos, assinaturas e usuários.
          </p>

          <div className="mt-8">
            <LoginFormCard
              title="Entrar como super admin"
              description="Use seu e-mail e senha para acessar o ambiente administrativo da plataforma."
              next={next}
              helperError={helperError}
              showSignupLink={false}
              requireSuperAdmin={true}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
