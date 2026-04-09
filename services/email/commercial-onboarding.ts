import { sendTransactionalEmail } from "@/services/email/resend";

type SendCommercialOnboardingEmailInput = {
  to: string;
  ownerName: string;
  agencyName: string;
  planName: string;
  portalLink: string;
  activationLink: string;
  mode: "trial" | "active";
};

export async function sendCommercialOnboardingEmail(input: SendCommercialOnboardingEmailInput) {
  const safeOwnerName = input.ownerName.trim() || "Olá";
  const headline =
    input.mode === "trial" ? "Seu período grátis no BRIFA foi liberado" : "Seu acesso ao BRIFA foi liberado";
  const intro =
    input.mode === "trial"
      ? `O período gratuito do plano <strong>${input.planName}</strong> para a agência <strong>${input.agencyName}</strong> já começou.`
      : `O pagamento do plano <strong>${input.planName}</strong> foi confirmado e a agência <strong>${input.agencyName}</strong> já está pronta para começar.`;
  const textHeadline = input.mode === "trial" ? "Seu período grátis no BRIFA foi liberado." : "Seu acesso ao BRIFA foi liberado.";

  const html = `
    <div style="background:#f5f7ff;padding:32px 16px;font-family:Arial,sans-serif;color:#111827;line-height:1.6;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:24px;padding:32px;">
        <h1 style="font-size:28px;line-height:1.2;margin:0 0 16px;">${headline}</h1>
        <p style="margin:0 0 12px;">Olá, ${safeOwnerName}.</p>
        <p style="margin:0 0 20px;">${intro}</p>

        <div style="margin:24px 0;padding:18px;border:1px solid #dbe4ff;background:#f8faff;border-radius:18px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1f2937;">Abra este link para definir sua senha e ativar a agência:</p>
          <p style="margin:0 0 10px;font-size:13px;color:#4b5563;">Em muitos e-mails ele já aparece clicável. Se não abrir, copie exatamente o endereço abaixo e cole na barra de endereços do navegador.</p>
          <p style="margin:0;padding:14px 16px;border-radius:14px;background:#ffffff;border:1px solid #c7d2fe;color:#1d4ed8;font-family:Menlo,Consolas,Monaco,monospace;font-size:13px;line-height:1.7;word-break:break-all;">${input.activationLink}</p>
        </div>

        <div style="margin:24px 0 0;padding:16px;border:1px solid #e5e7eb;background:#fcfcfd;border-radius:18px;">
          <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1f2937;">Portal da agência</p>
          <p style="margin:0 0 8px;padding:12px 14px;border-radius:14px;background:#ffffff;border:1px solid #e5e7eb;color:#111827;font-family:Menlo,Consolas,Monaco,monospace;font-size:13px;line-height:1.6;word-break:break-all;">${input.portalLink}</p>
          <p style="margin:0;font-size:13px;color:#6b7280;">Depois da senha criada, o acesso do administrador ficará disponível normalmente nesse portal.</p>
        </div>

        <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Se você não reconhece essa contratação, ignore esta mensagem.</p>
      </div>
    </div>
  `;

  const text = [
    textHeadline,
    `Agência: ${input.agencyName}`,
    `Plano: ${input.planName}`,
    `Concluir primeiro acesso: ${input.activationLink}`,
    `Portal da agência: ${input.portalLink}`
  ].join("\n");

  return sendTransactionalEmail({
    to: input.to,
    subject: input.mode === "trial" ? `Seu período grátis no BRIFA começou` : `BRIFA liberado para ${input.agencyName}`,
    html,
    text
  });
}
