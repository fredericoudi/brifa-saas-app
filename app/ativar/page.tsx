import Link from "next/link";
import { AgencyActivationForm } from "@/components/master/agency-activation-form";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { findAgencyActivation } from "@/lib/agency-activation";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

function InvalidActivationState({
  title,
  description
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </CardHeader>
      <CardContent>
        <div className="text-right text-xs text-muted">
          <Link href="/login" className="hover:text-brand">
            Voltar para o login
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function AgencyActivationPage({
  searchParams
}: {
  searchParams: { agency?: string; token?: string };
}) {
  const agencySlug = searchParams.agency?.trim() ?? "";
  const token = searchParams.token?.trim() ?? "";

  if (!agencySlug || !token) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <InvalidActivationState
            title="Link incompleto"
            description="Os parâmetros de ativação estão ausentes. Solicite um novo link ao administrador da plataforma."
          />
        </div>
      </main>
    );
  }

  const admin = createAdminSupabaseClient();
  const activation = await findAgencyActivation(admin, agencySlug, token);

  if (!activation.agency || !activation.invitation) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <InvalidActivationState
            title="Link inválido"
            description="Não encontramos um convite de ativação compatível com esse link."
          />
        </div>
      </main>
    );
  }

  if (activation.invitation.status !== "pending") {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <InvalidActivationState
            title="Link já utilizado"
            description="Esse link de ativação já foi usado ou cancelado. Solicite um novo ao super admin."
          />
        </div>
      </main>
    );
  }

  if (activation.expired) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md">
          <InvalidActivationState
            title="Link expirado"
            description="O prazo desse link de ativação expirou. Solicite a geração de um novo link."
          />
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 md:p-8">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <h1 className="text-xl font-semibold">Ativar agência</h1>
            <p className="mt-1 text-sm text-muted">
              Conclua o acesso inicial de <strong>{activation.agency.name}</strong> e crie o administrador principal.
            </p>
          </CardHeader>
          <CardContent>
            <AgencyActivationForm
              agencySlug={activation.agency.slug}
              token={token}
              email={activation.invitation.email}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
