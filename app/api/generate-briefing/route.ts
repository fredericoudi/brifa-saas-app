import OpenAI from "openai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  necessidade: z.string().trim().min(1, "Necessidade do cliente não informada").max(12000)
});

function mapOpenAiErrorMessage(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429 || error.code === "insufficient_quota") {
      return "Sua conta OpenAI está sem saldo ou excedeu a cota atual. Verifique billing, limites de uso e a chave configurada.";
    }

    if (error.status === 401) {
      return "A chave da OpenAI está inválida ou sem permissão para este modelo.";
    }

    if (error.status === 403) {
      return "A conta OpenAI não tem permissão para usar este recurso ou modelo.";
    }

    if (error.status === 404) {
      return "O modelo configurado para gerar briefing não foi encontrado.";
    }

    if (error.status === 429) {
      return "A OpenAI está limitando temporariamente as requisições. Tente novamente em instantes.";
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro ao gerar briefing com IA";
}

function isMissingAiLogsTable(message: string) {
  return message.includes("Could not find the table 'public.ai_logs'") || message.includes('relation "ai_logs" does not exist');
}

export async function POST(req: Request) {
  try {
    const parsed = bodySchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Necessidade do cliente não informada" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("users")
      .select("agency_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const commercialAccess = await assertAgencyActionAllowed({
      supabase,
      agencyId: profile.agency_id,
      action: "ai_briefing"
    });

    if (!commercialAccess.allowed) {
      if (commercialAccess.reason === "limit_reached") {
        return NextResponse.json(
          {
            error: "LIMIT_REACHED",
            type: "AI",
            message: commercialAccess.message ?? "Você atingiu o limite de gerações de IA do seu plano.",
            trialActivated: commercialAccess.context.trial.activated
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: commercialAccess.message ?? "A geração de briefing com IA está indisponível para sua assinatura." },
        { status: 403 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY não configurada." }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    const openai = new OpenAI({ apiKey });

    const prompt = `
Você é um planejador de comunicação de uma agência de publicidade.

A partir da necessidade do cliente abaixo, gere um briefing estruturado.

Necessidade do cliente:
${parsed.data.necessidade}

O briefing deve conter:

1. Objetivo da campanha
2. Público-alvo
3. Problema de comunicação
4. Conceito criativo sugerido
5. Mensagem principal
6. Peças sugeridas
7. Cronograma sugerido
`;

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    });

    const briefing = completion.choices[0]?.message?.content?.trim();

    if (!briefing) {
      return NextResponse.json({ error: "Erro ao gerar briefing com IA" }, { status: 500 });
    }

    const { error: aiLogError } = await supabase.from("ai_logs").insert({
      agency_id: profile.agency_id
    });

    if (aiLogError) {
      if (isMissingAiLogsTable(aiLogError.message)) {
        const { error: fallbackLogError } = await supabase.from("ai_actions_log").insert({
          agency_id: profile.agency_id,
          user_id: user.id,
          action_type: "generate_briefing",
          status: "success",
          payload: {
            source: "job_briefing_form"
          },
          result: {
            chars: briefing.length
          }
        });

        if (fallbackLogError) {
          console.error("Falha ao registrar uso de IA em fallback:", fallbackLogError.message);
        }
      } else {
        console.error("Falha ao registrar uso de IA:", aiLogError.message);
      }
    }

    return NextResponse.json({ briefing });
  } catch (error) {
    console.error("Falha ao gerar briefing com IA:", error);

    const message = mapOpenAiErrorMessage(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
