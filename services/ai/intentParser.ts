import OpenAI from "openai";
import { z } from "zod";
import { normalizePhoneNumber } from "@/lib/phone";

export const conversationalIntentSchema = z.enum([
  "CREATE_JOB",
  "LIST_TASKS",
  "UPDATE_STATUS",
  "DAILY_SUMMARY",
  "UNKNOWN"
]);

export type ConversationalIntent = z.infer<typeof conversationalIntentSchema>;

export const parsedUserMessageSchema = z.object({
  intent: conversationalIntentSchema,
  confidence: z.number().min(0).max(1),
  entities: z
    .object({
      title: z.string().optional(),
      client: z.string().optional(),
      deadline: z.string().optional(),
      status: z.string().optional(),
      task_title: z.string().optional(),
      job_title: z.string().optional(),
      job_code: z.string().optional(),
      phone_number: z.string().optional()
    })
    .catchall(z.union([z.string(), z.number(), z.boolean(), z.null()]))
});

export type ParsedUserMessage = z.infer<typeof parsedUserMessageSchema>;

function buildFallbackIntent(message: string): ParsedUserMessage {
  const normalized = message.trim().toLowerCase();

  if (/(cria|criar|novo job|abrir job)/.test(normalized)) {
    return {
      intent: "CREATE_JOB",
      confidence: 0.55,
      entities: {
        title: message.trim()
      }
    };
  }

  if (/(minhas tarefas|listar tarefas|lista de tarefas|tarefas de hoje)/.test(normalized)) {
    return {
      intent: "LIST_TASKS",
      confidence: 0.7,
      entities: {}
    };
  }

  if (/(resumo do dia|resumo diário|daily summary|fechamento do dia)/.test(normalized)) {
    return {
      intent: "DAILY_SUMMARY",
      confidence: 0.7,
      entities: {}
    };
  }

  if (/(atualiza|muda status|altera status|conclu[ií]|finaliza|aprova|revis[aã]o)/.test(normalized)) {
    return {
      intent: "UPDATE_STATUS",
      confidence: 0.55,
      entities: {
        status: normalized
      }
    };
  }

  return {
    intent: "UNKNOWN",
    confidence: 0.2,
    entities: {}
  };
}

function normalizeParserPayload(payload: ParsedUserMessage): ParsedUserMessage {
  const entities: ParsedUserMessage["entities"] = {
    ...payload.entities
  };
  const normalizedDeadline =
    typeof payload.entities.deadline === "string" && payload.entities.deadline.trim().length > 0
      ? payload.entities.deadline.trim()
      : undefined;
  const normalizedPhone = normalizePhoneNumber(payload.entities.phone_number) ?? undefined;

  if (normalizedDeadline) {
    entities.deadline = normalizedDeadline;
  }

  if (normalizedPhone) {
    entities.phone_number = normalizedPhone;
  }

  return {
    intent: payload.intent,
    confidence: Number.isFinite(payload.confidence) ? payload.confidence : 0,
    entities
  };
}

export async function parseUserMessage(message: string, context?: Record<string, unknown>) {
  const trimmedMessage = message.trim();

  if (!trimmedMessage) {
    return {
      intent: "UNKNOWN",
      confidence: 0,
      entities: {}
    } satisfies ParsedUserMessage;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_INTENT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (!apiKey) {
    return buildFallbackIntent(trimmedMessage);
  }

  const openai = new OpenAI({ apiKey });
  const systemPrompt = `
Você é o motor de interpretação do BRIFA, um SaaS de gestão de agência.

Sua tarefa é classificar a intenção da mensagem do usuário e extrair entidades úteis.

Responda apenas em JSON válido com esta estrutura:
{
  "intent": "CREATE_JOB" | "LIST_TASKS" | "UPDATE_STATUS" | "DAILY_SUMMARY" | "UNKNOWN",
  "confidence": 0.0-1.0,
  "entities": {
    "title": "...",
    "client": "...",
    "deadline": "YYYY-MM-DD",
    "status": "...",
    "task_title": "...",
    "job_title": "...",
    "job_code": "..."
  }
}

Regras:
- Se não tiver confiança suficiente, retorne UNKNOWN.
- Use deadline em formato YYYY-MM-DD somente quando conseguir inferir com segurança.
- UPDATE_STATUS pode ser de job ou tarefa.
- LIST_TASKS pode significar listar tarefas do próprio usuário.
- DAILY_SUMMARY significa resumo operacional do dia.
`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: JSON.stringify({
            message: trimmedMessage,
            context: context ?? {}
          })
        }
      ]
    });

    const rawContent = completion.choices[0]?.message?.content?.trim();

    if (!rawContent) {
      return buildFallbackIntent(trimmedMessage);
    }

    const parsedJson = JSON.parse(rawContent);
    const parsed = parsedUserMessageSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return buildFallbackIntent(trimmedMessage);
    }

    return normalizeParserPayload(parsed.data);
  } catch {
    return buildFallbackIntent(trimmedMessage);
  }
}
