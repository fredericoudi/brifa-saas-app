import { CheckCircle2, Clock3, Mail, ArrowRight } from "lucide-react";
import { SignupSuccessActions } from "@/components/commercial/signup-success-actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PUBLIC_SIGNUP_PLAN_LABEL, type PublicSignupPlanSlug } from "@/lib/commercial-signup";
import { resolveAgencyPortalPath } from "@/lib/agency-routing";

export function SignupSuccessContent({
  plan,
  agencySlug
}: {
  plan: PublicSignupPlanSlug;
  agencySlug?: string | null;
}) {
  const normalizedAgencySlug = agencySlug?.trim().toLowerCase() ?? "";
  const portalPath = normalizedAgencySlug
    ? resolveAgencyPortalPath(normalizedAgencySlug) ?? `/app/${normalizedAgencySlug}`
    : null;
  const steps = [
    {
      title: "1. E-mail de acesso",
      description: "O responsável da agência recebe o link para concluir o primeiro acesso e criar a senha do administrador.",
      icon: Mail
    },
    {
      title: "2. Conclusão do onboarding",
      description: "Ao abrir o link, o cliente define a senha inicial e ativa a entrada no painel da agência.",
      icon: Clock3
    },
    {
      title: "3. Acesso ao painel",
      description: "Depois da senha criada, o administrador entra normalmente no portal da agência e segue a operação.",
      icon: ArrowRight
    }
  ] as const;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#F8FAFF_0%,#FFFFFF_100%)] px-4 py-10 md:px-8">
      <div className="w-full max-w-[760px] space-y-6">
        <div className="text-center">
          <div className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-[24px] bg-emerald-50 text-emerald-600 shadow-[0_18px_50px_-38px_rgba(16,185,129,0.85)]">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight text-text">Pagamento confirmado</h1>
          <p className="mx-auto mt-3 max-w-[42rem] text-base leading-7 text-muted">
            Recebemos a confirmação da contratação do plano {PUBLIC_SIGNUP_PLAN_LABEL[plan]}. Agora o caminho certo para o cliente é
            concluir o primeiro acesso da agência e definir a senha inicial.
          </p>
        </div>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-text">O que acontece agora</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {steps.map((step) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.title}
                    className="flex items-start gap-4 rounded-[24px] border border-border bg-panelAlt/35 p-4 sm:p-5"
                  >
                    <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-brand shadow-[0_10px_30px_-24px_rgba(66,99,235,0.85)]">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{step.title}</p>
                      <p className="mt-2 text-sm leading-6 text-muted">{step.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
              Se o e-mail não chegar em alguns minutos, vale conferir spam/lixo eletrônico. Se precisar, use o botão abaixo para
              reenviar o acesso da agência.
            </div>

            {portalPath ? (
              <div className="mt-6 rounded-[24px] border border-border bg-white px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Portal da agência</p>
                <p className="mt-2 text-sm font-medium text-text">brifa.app{portalPath}</p>
                <p className="mt-2 text-sm text-muted">
                  Esse é o endereço final da agência. O cliente só deve usar esse portal depois de concluir o primeiro acesso pelo link
                  enviado por e-mail.
                </p>
              </div>
            ) : null}

            <SignupSuccessActions agencySlug={normalizedAgencySlug || null} portalPath={portalPath} />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
