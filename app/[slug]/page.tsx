import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import loginBackground from "@/images/login_bg.webp";
import logoBrifa from "@/images/logo_brifa.svg";
import { LoginFormCard } from "@/components/auth/login-form-card";
import { BrifaFavicon } from "@/components/layout/brifa-favicon";
import { AgencyMark } from "@/components/layout/agency-mark";
import type { Agency, UserProfile } from "@/lib/database.types";
import { getAgencyBrandStyleVars } from "@/lib/agency-branding";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AgencyAccessPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.trim().toLowerCase();
  const admin = createAdminSupabaseClient();
  const supabase = createServerSupabaseClient();

  const [{ data: agencyData }, { data: authData }] = await Promise.all([
    admin.from("agencies").select("id, name, slug, status, logo_url, brand_color, updated_at").eq("slug", slug).maybeSingle(),
    supabase.auth.getUser()
  ]);
  const agency = agencyData as Pick<Agency, "id" | "name" | "slug" | "status" | "logo_url" | "brand_color" | "updated_at"> | null;

  if (!agency) {
    notFound();
  }

  const user = authData.user;

  if (user) {
    const { data } = await supabase.from("users").select("agency_id, platform_role").eq("id", user.id).maybeSingle();
    const profile = data as Pick<UserProfile, "agency_id" | "platform_role"> | null;

    const isSuperAdminPreview = profile?.platform_role === "super_admin";

    if (!isSuperAdminPreview && profile?.agency_id === agency.id) {
      redirect("/dashboard");
    }

    if (!isSuperAdminPreview) {
      redirect("/dashboard");
    }
  }

  const brandStyle = getAgencyBrandStyleVars(agency.brand_color);
  const agencyBlocked = agency.status === "inactive" || agency.status === "suspended";

  return (
    <main className="min-h-screen bg-white" style={brandStyle as CSSProperties}>
      <BrifaFavicon />
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="flex min-h-screen bg-white">
          <div className="flex w-full flex-col px-8 py-8 sm:px-12 lg:px-14 xl:px-16">
            <div className="w-full">
              <div className="flex items-center justify-between gap-6">
              <div className="flex h-[28px] items-center">
                <Image
                  src={logoBrifa}
                  alt="Brifa"
                  priority
                  className="h-auto w-[100px]"
                />
              </div>

              <div className="flex items-center justify-end gap-4">
                <AgencyMark
                  agencyName={agency.name}
                  logoUrl={agency.logo_url}
                  updatedAt={agency.updated_at}
                  className="h-14 w-14 rounded-[22px] border border-border/70 bg-panelAlt"
                  fallbackClassName="text-xl font-semibold"
                />
                <div>
                  <h1 className="text-[1.2rem] font-semibold tracking-tight text-text">{agency.name}</h1>
                </div>
              </div>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-[560px]">
                {agencyBlocked ? (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[3rem] font-semibold tracking-tight text-text">Acesso temporariamente indisponível</h2>
                      <p className="mt-4 text-lg leading-8 text-muted">
                        O portal de <strong>{agency.name}</strong> está {agency.status === "suspended" ? "suspenso" : "inativo"} no momento.
                      </p>
                    </div>

                    <div className="rounded-[28px] border border-border bg-panelAlt/60 p-6">
                      <p className="text-sm leading-7 text-muted">
                        Entre em contato com o administrador da plataforma para regularizar o acesso desta agência.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-8">
                    <div>
                      <h2 className="text-[3.25rem] font-semibold tracking-tight text-text">Entrar</h2>
                      <p className="mt-4 text-lg leading-8 text-muted">
                        Entre com seu e-mail e senha para continuar no painel da {agency.name}.
                      </p>
                    </div>

                    {user ? (
                      <div className="rounded-[28px] border border-border bg-panelAlt/60 p-6">
                        <p className="text-sm leading-7 text-muted">
                          Você está vendo este portal com a sua sessão de super admin. Se entrar com um usuário da agência, a sessão atual será substituída.
                        </p>
                      </div>
                    ) : null}

                    <LoginFormCard
                      title={`Entrar em ${agency.name}`}
                      description="Use o seu e-mail e senha para acessar o painel desta agência."
                      next="/dashboard"
                      showSignupLink={false}
                      style={brandStyle as CSSProperties}
                      variant="bare"
                      formClassName="space-y-5"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="w-full pt-8">
              <Link href="/" className="inline-flex items-center gap-2 text-xs text-muted transition hover:text-brand">
                Login geral da plataforma
                {agencyBlocked ? <ArrowRight className="h-3.5 w-3.5" /> : null}
              </Link>
            </div>
          </div>
        </section>

        <section className="relative hidden min-h-screen lg:block">
          <Image
            src={loginBackground}
            alt={`Visual de acesso da agência ${agency.name}`}
            fill
            priority
            className="object-cover"
          />
        </section>
      </div>
    </main>
  );
}
