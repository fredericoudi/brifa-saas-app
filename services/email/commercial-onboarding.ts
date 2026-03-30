import { sendTransactionalEmail } from "@/services/email/resend";

type SendCommercialOnboardingEmailInput = {
  to: string;
  ownerName: string;
  agencyName: string;
  planName: string;
  portalLink: string;
  activationLink: string;
};

export async function sendCommercialOnboardingEmail(input: SendCommercialOnboardingEmailInput) {
  const safeOwnerName = input.ownerName.trim() || "Olá";

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.6;">
      <h1 style="font-size: 24px; margin-bottom: 16px;">Seu acesso ao BRIFA foi liberado</h1>
      <p>Olá, ${safeOwnerName}.</p>
      <p>
        O pagamento do plano <strong>${input.planName}</strong> foi confirmado e a agência
        <strong> ${input.agencyName}</strong> já está pronta para começar.
      </p>
      <p>
        Para concluir o primeiro acesso, defina sua senha aqui:<br />
        <a href="${input.activationLink}">${input.activationLink}</a>
      </p>
      <p>
        Depois disso, o portal da agência ficará disponível em:<br />
        <a href="${input.portalLink}">${input.portalLink}</a>
      </p>
      <p>Se você não reconhece essa contratação, ignore esta mensagem.</p>
    </div>
  `;

  const text = [
    "Seu acesso ao BRIFA foi liberado.",
    `Agência: ${input.agencyName}`,
    `Plano: ${input.planName}`,
    `Concluir primeiro acesso: ${input.activationLink}`,
    `Portal da agência: ${input.portalLink}`
  ].join("\n");

  return sendTransactionalEmail({
    to: input.to,
    subject: `BRIFA liberado para ${input.agencyName}`,
    html,
    text
  });
}
