type SendTransactionalEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendTransactionalEmail(input: SendTransactionalEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();

  if (!apiKey || !from) {
    return {
      sent: false,
      skipped: true,
      reason: "missing_config"
    } as const;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text
    })
  });

  const payload = (await response.json().catch(() => null)) as { message?: string; id?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "O provedor de e-mail recusou o envio.");
  }

  return {
    sent: true,
    skipped: false,
    id: payload?.id ?? null
  } as const;
}
