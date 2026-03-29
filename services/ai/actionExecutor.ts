import { normalizeAgencyRole } from "@/lib/agency-roles";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import type { Database } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { JOB_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/utils";
import type { ParsedUserMessage } from "@/services/ai/intentParser";
import type { ResolvedPhoneUser } from "@/services/auth/resolveUserByPhone";

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[];
type JsonRecord = Record<string, JsonValue>;

export type ActionExecutorInput = {
  parsed: ParsedUserMessage;
  actor: ResolvedPhoneUser;
  conversationId?: string | null;
  rawMessage: string;
};

export type ActionExecutorResult = {
  ok: boolean;
  intent: ParsedUserMessage["intent"];
  response: string;
  data?: JsonRecord;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isAdmin(actor: ResolvedPhoneUser) {
  return actor.role === "admin";
}

function isAtendimento(actor: ResolvedPhoneUser) {
  return normalizeAgencyRole(actor.agency_role) === "Atendimento";
}

function canCreateJob(actor: ResolvedPhoneUser) {
  return isAdmin(actor) || isAtendimento(actor);
}

function canListAgencyWide(actor: ResolvedPhoneUser) {
  return isAdmin(actor) || isAtendimento(actor);
}

function canUpdateAnyStatus(actor: ResolvedPhoneUser) {
  return isAdmin(actor) || isAtendimento(actor);
}

function mapTaskStatus(rawStatus: string | undefined) {
  const normalized = normalizeText(rawStatus);
  if (!normalized) return null;
  if (/(conclu|finaliz|feito|done)/.test(normalized)) return "concluido" as const;
  if (/(revis)/.test(normalized)) return "revisao" as const;
  if (/(andamento|fazendo|produc|execu)/.test(normalized)) return "em_andamento" as const;
  if (/(fazer|pendente|inici|backlog)/.test(normalized)) return "a_fazer" as const;
  return null;
}

function mapJobStatus(rawStatus: string | undefined) {
  const normalized = normalizeText(rawStatus);
  if (!normalized) return null;
  if (/(brief)/.test(normalized)) return "briefing" as const;
  if (/(cri|produ)/.test(normalized)) return "criacao" as const;
  if (/(revis)/.test(normalized)) return "revisao" as const;
  if (/(aprova)/.test(normalized)) return "aprovado" as const;
  if (/(final|conclu)/.test(normalized)) return "finalizado" as const;
  return null;
}

function buildClientPrefixFromName(clientName: string) {
  const normalized = clientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .trim();

  const words = normalized
    .split(/\s+/)
    .filter((word) => word && !["DE", "DA", "DO", "DAS", "DOS", "E"].includes(word));

  if (words.length === 0) return "CLI";
  if (words.length === 1) return words[0].slice(0, 3).padEnd(3, "X");

  const initials = words.map((word) => word[0]).join("").slice(0, 3);
  if (initials.length === 3) return initials;
  return `${initials}${words[words.length - 1].slice(1)}`.slice(0, 3).padEnd(3, "X");
}

async function generateNextJobCode({
  agencyId,
  clientId,
  clientPrefix
}: {
  agencyId: string;
  clientId: string;
  clientPrefix: string;
}) {
  const admin = createAdminSupabaseClient();
  const yearSuffix = new Date().getFullYear().toString().slice(-2);

  const { data, error } = await admin
    .from("jobs")
    .select("job_code")
    .eq("agency_id", agencyId)
    .eq("client_id", clientId)
    .like("job_code", `${clientPrefix}-%-${yearSuffix}`);

  if (error) {
    throw new Error(error.message);
  }

  let maxSequence = 0;
  for (const job of data ?? []) {
    const jobCode = job.job_code ?? "";
    const match = jobCode.match(new RegExp(`^${clientPrefix}-(\\d{4})-${yearSuffix}$`));
    if (!match) continue;
    const next = Number(match[1]);
    if (Number.isFinite(next)) {
      maxSequence = Math.max(maxSequence, next);
    }
  }

  return `${clientPrefix}-${String(maxSequence + 1).padStart(4, "0")}-${yearSuffix}`;
}

function inferCreateJobEntities(rawMessage: string, parsed: ParsedUserMessage["entities"]) {
  const clientMatch = rawMessage.match(/cliente\s+(.+?)(?:\s+com prazo|\s+para|\s+até|$)/i);
  const titleMatch = rawMessage.match(/(?:job|campanha|projeto)\s+(?:para\s+)?(.+?)(?:\s+cliente|\s+com prazo|\s+até|$)/i);

  return {
    title: parsed.title?.trim() || titleMatch?.[1]?.trim() || undefined,
    client: parsed.client?.trim() || clientMatch?.[1]?.trim() || undefined,
    deadline: parsed.deadline?.trim() || undefined
  };
}

async function createJobEvent({
  jobId,
  userId,
  eventType,
  description
}: {
  jobId: string;
  userId: string | null;
  eventType: string;
  description: string;
}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("job_events").insert({
    job_id: jobId,
    user_id: userId,
    event_type: eventType,
    description
  });

  if (error) {
    console.error("Falha ao registrar job_event via executor:", error.message);
  }
}

async function logAiAction({
  agencyId,
  userId,
  conversationId,
  actionType,
  status,
  payload,
  result
}: {
  agencyId: string;
  userId: string | null;
  conversationId?: string | null;
  actionType: string;
  status: string;
  payload?: JsonRecord;
  result?: JsonRecord;
}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("ai_actions_log").insert({
    agency_id: agencyId,
    user_id: userId,
    conversation_id: conversationId ?? null,
    action_type: actionType,
    status,
    payload: payload ?? null,
    result: result ?? null
  });

  if (error) {
    console.error("Falha ao registrar ai_actions_log:", error.message);
  }
}

async function executeCreateJob(input: ActionExecutorInput): Promise<ActionExecutorResult> {
  const { actor, parsed, rawMessage } = input;
  if (!canCreateJob(actor)) {
    return {
      ok: false,
      intent: parsed.intent,
      response: "Você não tem permissão para criar jobs por conversa."
    };
  }

  const admin = createAdminSupabaseClient();
  const commercial = await assertAgencyActionAllowed({
    supabase: admin,
    agencyId: actor.agency_id,
    action: "create_job"
  });

  if (!commercial.allowed) {
    return {
      ok: false,
      intent: parsed.intent,
      response: commercial.message ?? "A criação de jobs está indisponível para esta agência."
    };
  }

  const inferred = inferCreateJobEntities(rawMessage, parsed.entities);
  if (!inferred.client) {
    return {
      ok: false,
      intent: parsed.intent,
      response: "Entendi que você quer criar um job, mas preciso do nome do cliente para continuar."
    };
  }

  const { data: clients, error: clientsError } = await admin
    .from("clients")
    .select("id, name, company, prefix")
    .eq("agency_id", actor.agency_id);

  if (clientsError) {
    throw new Error(clientsError.message);
  }

  const normalizedClientQuery = normalizeText(inferred.client);
  const matchedClient =
    (clients ?? []).find(
      (client) =>
        normalizeText(client.name) === normalizedClientQuery ||
        normalizeText(client.company) === normalizedClientQuery
    ) ??
    (clients ?? []).find(
      (client) =>
        normalizeText(client.name).includes(normalizedClientQuery) ||
        normalizeText(client.company).includes(normalizedClientQuery)
    );

  if (!matchedClient) {
    return {
      ok: false,
      intent: parsed.intent,
      response: `Não encontrei o cliente "${inferred.client}" no cadastro da agência.`
    };
  }

  const title = inferred.title && normalizeText(inferred.title) !== normalizeText(rawMessage)
    ? inferred.title
    : `Solicitação ${matchedClient.name}`;
  const clientPrefix = (matchedClient.prefix ?? buildClientPrefixFromName(matchedClient.name)).toUpperCase();
  const jobCode = await generateNextJobCode({
    agencyId: actor.agency_id,
    clientId: matchedClient.id,
    clientPrefix
  });

  const { data: createdJob, error: createError } = await admin
    .from("jobs")
    .insert({
      agency_id: actor.agency_id,
      client_id: matchedClient.id,
      title,
      client_need: rawMessage,
      description: null,
      status: "briefing",
      job_code: jobCode,
      due_date: inferred.deadline ?? null,
      created_by: actor.id
    })
    .select("id, title, job_code, due_date")
    .single();

  if (createError || !createdJob) {
    throw new Error(createError?.message ?? "Falha ao criar job.");
  }

  await createJobEvent({
    jobId: createdJob.id,
    userId: actor.id,
    eventType: "job_created",
    description: `Job criado via conversa por ${actor.name}.`
  });

  return {
    ok: true,
    intent: parsed.intent,
    response: `Job criado com sucesso: ${createdJob.job_code ?? "sem código"} - ${createdJob.title}`,
    data: {
      jobId: createdJob.id,
      jobCode: createdJob.job_code ?? "",
      title: createdJob.title,
      dueDate: createdJob.due_date ?? ""
    }
  };
}

async function fetchAgencyJobsForLookup(agencyId: string) {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("jobs")
    .select("id, title, job_code, status, archived_at")
    .eq("agency_id", agencyId);

  if (error) throw new Error(error.message);
  return (data ?? []).filter((job) => !job.archived_at);
}

async function fetchAgencyTasksForLookup({
  agencyId,
  userId
}: {
  agencyId: string;
  userId?: string;
}) {
  const admin = createAdminSupabaseClient();

  if (!userId) {
    const { data, error } = await admin
      .from("tasks")
      .select("id, job_id, title, status, due_date")
      .eq("agency_id", agencyId);

    if (error) throw new Error(error.message);
    return data ?? [];
  }

  const { data: assignees, error: assigneeError } = await admin
    .from("task_assignees")
    .select("task_id")
    .eq("agency_id", agencyId)
    .eq("user_id", userId);

  if (assigneeError) throw new Error(assigneeError.message);

  const taskIds = [...new Set((assignees ?? []).map((item) => item.task_id))];
  if (taskIds.length === 0) return [];

  const { data: tasks, error: tasksError } = await admin
    .from("tasks")
    .select("id, job_id, title, status, due_date")
    .eq("agency_id", agencyId)
    .in("id", taskIds);

  if (tasksError) throw new Error(tasksError.message);
  return tasks ?? [];
}

async function executeListTasks(input: ActionExecutorInput): Promise<ActionExecutorResult> {
  const { actor, parsed } = input;
  const admin = createAdminSupabaseClient();
  const ownOnly = !canListAgencyWide(actor);
  const tasks = await fetchAgencyTasksForLookup({
    agencyId: actor.agency_id,
    userId: ownOnly ? actor.id : undefined
  });

  const filteredTasks = tasks
    .filter((task) => task.status !== "concluido")
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    })
    .slice(0, 8);

  if (filteredTasks.length === 0) {
    return {
      ok: true,
      intent: parsed.intent,
      response: ownOnly
        ? "Você não tem tarefas pendentes no momento."
        : "Não encontrei tarefas pendentes para esta agência."
    };
  }

  const jobIds = [...new Set(filteredTasks.map((task) => task.job_id))];
  const { data: jobs, error: jobsError } = await admin
    .from("jobs")
    .select("id, title, job_code")
    .eq("agency_id", actor.agency_id)
    .in("id", jobIds);

  if (jobsError) throw new Error(jobsError.message);
  const jobsMap = new Map((jobs ?? []).map((job) => [job.id, job]));

  const lines = filteredTasks.map((task, index) => {
    const job = jobsMap.get(task.job_id);
    const jobLabel = job?.job_code ? `${job.job_code} · ${job.title}` : job?.title ?? "Sem job";
    return `${index + 1}. ${task.title} — ${jobLabel} — ${TASK_STATUS_LABEL[task.status]}${
      task.due_date ? ` — prazo ${task.due_date}` : ""
    }`;
  });

  return {
    ok: true,
    intent: parsed.intent,
    response: ownOnly
      ? `Estas são as suas tarefas pendentes:\n${lines.join("\n")}`
      : `Encontrei estas tarefas pendentes:\n${lines.join("\n")}`,
    data: {
      total: filteredTasks.length,
      ownOnly
    }
  };
}

async function updateJobStatus(input: ActionExecutorInput, nextStatus: Database["public"]["Enums"]["job_status"]) {
  const { actor, parsed } = input;
  if (!canUpdateAnyStatus(actor)) {
    return {
      ok: false,
      intent: parsed.intent,
      response: "Você não tem permissão para alterar o status de jobs."
    } satisfies ActionExecutorResult;
  }

  const jobs = await fetchAgencyJobsForLookup(actor.agency_id);
  const jobCodeQuery = normalizeText(parsed.entities.job_code);
  const jobTitleQuery = normalizeText(parsed.entities.job_title || parsed.entities.title);

  const targetJob =
    jobs.find((job) => normalizeText(job.job_code) === jobCodeQuery) ??
    jobs.find((job) => normalizeText(job.title) === jobTitleQuery) ??
    jobs.find((job) => normalizeText(job.title).includes(jobTitleQuery));

  if (!targetJob) {
    return {
      ok: false,
      intent: parsed.intent,
      response: "Não encontrei o job que deve ter o status atualizado."
    } satisfies ActionExecutorResult;
  }

  if (targetJob.status === nextStatus) {
    return {
      ok: true,
      intent: parsed.intent,
      response: `O job ${targetJob.job_code ?? targetJob.title} já está em ${JOB_STATUS_LABEL[nextStatus]}.`
    } satisfies ActionExecutorResult;
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("jobs").update({ status: nextStatus }).eq("id", targetJob.id);
  if (error) throw new Error(error.message);

  await createJobEvent({
    jobId: targetJob.id,
    userId: actor.id,
    eventType: "job_status_changed",
    description: `Status do job alterado de "${JOB_STATUS_LABEL[targetJob.status]}" para "${JOB_STATUS_LABEL[nextStatus]}" via conversa por ${actor.name}.`
  });

  return {
    ok: true,
    intent: parsed.intent,
    response: `Status do job ${targetJob.job_code ?? targetJob.title} atualizado para ${JOB_STATUS_LABEL[nextStatus]}.`,
    data: {
      jobId: targetJob.id,
      status: nextStatus
    }
  } satisfies ActionExecutorResult;
}

async function updateTaskStatus(input: ActionExecutorInput, nextStatus: Database["public"]["Enums"]["task_status"]) {
  const { actor, parsed } = input;
  const ownOnly = !canUpdateAnyStatus(actor);
  const tasks = await fetchAgencyTasksForLookup({
    agencyId: actor.agency_id,
    userId: ownOnly ? actor.id : undefined
  });

  if (tasks.length === 0) {
    return {
      ok: false,
      intent: parsed.intent,
      response: ownOnly
        ? "Você não tem tarefas disponíveis para atualizar."
        : "Não encontrei tarefas disponíveis para atualizar."
    } satisfies ActionExecutorResult;
  }

  const taskTitleQuery = normalizeText(parsed.entities.task_title || parsed.entities.title);
  const targetTask =
    tasks.find((task) => normalizeText(task.title) === taskTitleQuery) ??
    tasks.find((task) => normalizeText(task.title).includes(taskTitleQuery)) ??
    (taskTitleQuery ? null : tasks.length === 1 ? tasks[0] : null);

  if (!targetTask) {
    return {
      ok: false,
      intent: parsed.intent,
      response: ownOnly
        ? "Não consegui identificar qual das suas tarefas deve ser atualizada."
        : "Não consegui identificar qual tarefa deve ser atualizada."
    } satisfies ActionExecutorResult;
  }

  if (targetTask.status === nextStatus) {
    return {
      ok: true,
      intent: parsed.intent,
      response: `A tarefa "${targetTask.title}" já está em ${TASK_STATUS_LABEL[nextStatus]}.`
    } satisfies ActionExecutorResult;
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("tasks").update({ status: nextStatus }).eq("id", targetTask.id);
  if (error) throw new Error(error.message);

  await createJobEvent({
    jobId: targetTask.job_id,
    userId: actor.id,
    eventType: nextStatus === "concluido" ? "task_completed" : "task_edited",
    description:
      nextStatus === "concluido"
        ? `${actor.name} concluiu a tarefa "${targetTask.title}" via conversa.`
        : `${actor.name} atualizou a tarefa "${targetTask.title}" para ${TASK_STATUS_LABEL[nextStatus]} via conversa.`
  });

  return {
    ok: true,
    intent: parsed.intent,
    response: `Tarefa "${targetTask.title}" atualizada para ${TASK_STATUS_LABEL[nextStatus]}.`,
    data: {
      taskId: targetTask.id,
      jobId: targetTask.job_id,
      status: nextStatus
    }
  } satisfies ActionExecutorResult;
}

async function executeUpdateStatus(input: ActionExecutorInput): Promise<ActionExecutorResult> {
  const rawStatus = input.parsed.entities.status;
  const jobStatus = mapJobStatus(rawStatus);
  const taskStatus = mapTaskStatus(rawStatus);

  if (jobStatus && (input.parsed.entities.job_code || input.parsed.entities.job_title || canUpdateAnyStatus(input.actor))) {
    return updateJobStatus(input, jobStatus);
  }

  if (taskStatus) {
    return updateTaskStatus(input, taskStatus);
  }

  return {
    ok: false,
    intent: input.parsed.intent,
    response: "Entendi que você quer atualizar um status, mas preciso saber para qual etapa devo mover."
  };
}

async function executeDailySummary(input: ActionExecutorInput): Promise<ActionExecutorResult> {
  const { actor, parsed } = input;
  const admin = createAdminSupabaseClient();

  if (canListAgencyWide(actor)) {
    const [{ count: jobsCount }, { count: openTasks }, { count: reviewTasks }] = await Promise.all([
      admin.from("jobs").select("id", { count: "exact", head: true }).eq("agency_id", actor.agency_id).is("archived_at", null),
      admin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", actor.agency_id)
        .neq("status", "concluido"),
      admin
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("agency_id", actor.agency_id)
        .eq("status", "revisao")
    ]);

    return {
      ok: true,
      intent: parsed.intent,
      response: `Resumo da agência hoje: ${jobsCount ?? 0} jobs ativos, ${openTasks ?? 0} tarefas pendentes e ${reviewTasks ?? 0} tarefas em revisão.`,
      data: {
        activeJobs: jobsCount ?? 0,
        openTasks: openTasks ?? 0,
        reviewTasks: reviewTasks ?? 0
      }
    };
  }

  const tasks = await fetchAgencyTasksForLookup({ agencyId: actor.agency_id, userId: actor.id });
  const openTasks = tasks.filter((task) => task.status !== "concluido");
  const reviewTasks = openTasks.filter((task) => task.status === "revisao");

  return {
    ok: true,
    intent: parsed.intent,
    response: `Seu resumo de hoje: ${openTasks.length} tarefas pendentes e ${reviewTasks.length} em revisão.`,
    data: {
      openTasks: openTasks.length,
      reviewTasks: reviewTasks.length
    }
  };
}

export async function executeConversationalAction(input: ActionExecutorInput): Promise<ActionExecutorResult> {
  const { actor, parsed, conversationId, rawMessage } = input;
  const payload: JsonRecord = {
    message: rawMessage,
    intent: parsed.intent,
    confidence: parsed.confidence,
    entities: parsed.entities,
    phoneNumber: normalizePhoneNumber(actor.phone_number) ?? "",
    role: actor.role,
    agencyRole: actor.agency_role
  };

  try {
    let result: ActionExecutorResult;

    switch (parsed.intent) {
      case "CREATE_JOB":
        result = await executeCreateJob(input);
        break;
      case "LIST_TASKS":
        result = await executeListTasks(input);
        break;
      case "UPDATE_STATUS":
        result = await executeUpdateStatus(input);
        break;
      case "DAILY_SUMMARY":
        result = await executeDailySummary(input);
        break;
      default:
        result = {
          ok: false,
          intent: parsed.intent,
          response: "Ainda não entendi com segurança o que você quer fazer. Tente reformular a mensagem."
        };
    }

    await logAiAction({
      agencyId: actor.agency_id,
      userId: actor.id,
      conversationId,
      actionType: parsed.intent,
      status: result.ok ? "success" : parsed.intent === "UNKNOWN" ? "unknown" : "blocked",
      payload,
      result: {
        response: result.response,
        ...(result.data ?? {})
      }
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar ação conversacional.";

    await logAiAction({
      agencyId: actor.agency_id,
      userId: actor.id,
      conversationId,
      actionType: parsed.intent,
      status: "error",
      payload,
      result: {
        error: message
      }
    });

    return {
      ok: false,
      intent: parsed.intent,
      response: message
    };
  }
}
