import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createJobFolder, refreshGoogleAccessToken } from "@/services/googleDriveService";

const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(180),
  priority: z.enum(["baixa", "media", "alta"]).default("media"),
  status: z.enum(["a_fazer", "em_andamento", "revisao", "concluido"]).default("a_fazer"),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  due_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .nullable(),
  description: z.string().trim().max(12000).optional().nullable(),
  assignee_ids: z.array(z.string().uuid()).max(1).default([])
});

const createJobSchema = z.object({
  client_id: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  client_need: z.string().trim().max(12000).optional().nullable(),
  description: z.string().trim().max(12000).optional().nullable(),
  status: z.enum(["briefing", "criacao", "revisao", "aprovado", "finalizado"]).default("briefing"),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  start_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .nullable(),
  due_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  due_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional()
    .nullable(),
  tasks: z.array(createTaskSchema).default([])
});

function normalizePrefix(prefix: string) {
  return prefix
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
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

  if (words.length === 0) {
    return "CLI";
  }

  if (words.length === 1) {
    return words[0].slice(0, 3).padEnd(3, "X");
  }

  const initials = words.map((word) => word[0]).join("").slice(0, 3);

  if (initials.length === 3) {
    return initials;
  }

  const lastWordSuffix = words[words.length - 1].slice(1);
  return `${initials}${lastWordSuffix}`.slice(0, 3).padEnd(3, "X");
}

function resolveClientPrefix({
  prefixFromDb,
  clientName
}: {
  prefixFromDb: string | null;
  clientName: string;
}) {
  const fromDb = prefixFromDb ? normalizePrefix(prefixFromDb) : "";
  if (fromDb) return fromDb;
  return buildClientPrefixFromName(clientName);
}

async function generateNextJobCode({
  supabase,
  agencyId,
  clientId,
  clientPrefix
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  agencyId: string;
  clientId: string;
  clientPrefix: string;
}) {
  const yearSuffix = new Date().getFullYear().toString().slice(-2);

  const { data: existingJobs, error } = await supabase
    .from("jobs")
    .select("job_code")
    .eq("agency_id", agencyId)
    .eq("client_id", clientId)
    .like("job_code", `%-____-${yearSuffix}`);

  if (error) {
    if (extractMissingSchemaColumn(error.message, "jobs") === "job_code") {
      return null;
    }

    throw new Error(error.message);
  }

  const matcher = new RegExp(`^[A-Z0-9]+-(\\d{4})-${yearSuffix}$`);
  let maxSequence = 0;

  for (const job of existingJobs ?? []) {
    if (!job.job_code) continue;
    const match = job.job_code.match(matcher);
    if (!match) continue;

    const sequence = Number(match[1]);
    if (!Number.isNaN(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  const nextSequence = String(maxSequence + 1).padStart(4, "0");
  return `${clientPrefix}-${nextSequence}-${yearSuffix}`;
}

async function createJobEvent({
  supabase,
  jobId,
  userId,
  eventType,
  description
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  jobId: string;
  userId: string | null;
  eventType: string;
  description: string;
}) {
  const { error } = await supabase.from("job_events").insert({
    job_id: jobId,
    user_id: userId,
    event_type: eventType,
    description
  });

  if (error) {
    console.error("Falha ao registrar evento do job:", error.message);
  }
}

function appendWarning(current: string | null, next: string) {
  return current ? `${current} ${next}` : next;
}

function extractMissingSchemaColumn(message: string, table: string) {
  const match = message.match(new RegExp(`Could not find the '([^']+)' column of '${table}' in the schema cache`));
  return match?.[1] ?? null;
}

async function insertJobWithCompatibility({
  supabase,
  payload
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  payload: Record<string, unknown>;
}) {
  const compatiblePayload = { ...payload };
  const omittedColumns = new Set<string>();

  while (true) {
    const { data, error } = await supabase.from("jobs").insert(compatiblePayload).select("id").single();

    if (!error && data) {
      return {
        data: data as { id: string },
        omittedColumns: [...omittedColumns]
      };
    }

    const missingColumn = error ? extractMissingSchemaColumn(error.message, "jobs") : null;
    if (missingColumn && missingColumn in compatiblePayload) {
      delete compatiblePayload[missingColumn];
      omittedColumns.add(missingColumn);
      continue;
    }

    throw new Error(error?.message ?? "Falha ao criar job.");
  }
}

async function insertTaskWithCompatibility({
  supabase,
  payload
}: {
  supabase: ReturnType<typeof createServerSupabaseClient>;
  payload: Record<string, unknown>;
}) {
  const compatiblePayload = { ...payload };
  const omittedColumns = new Set<string>();

  while (true) {
    const { data, error } = await supabase.from("tasks").insert(compatiblePayload).select("id").single();

    if (!error && data) {
      return {
        data: data as { id: string },
        omittedColumns: [...omittedColumns]
      };
    }

    const missingColumn = error ? extractMissingSchemaColumn(error.message, "tasks") : null;
    if (missingColumn && missingColumn in compatiblePayload) {
      delete compatiblePayload[missingColumn];
      omittedColumns.add(missingColumn);
      continue;
    }

    throw new Error(error?.message ?? "Falha ao criar tarefa.");
  }
}

export async function POST(request: Request) {
  try {
    const parsed = createJobSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para criação do job." }, { status: 400 });
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
      .select("id, agency_id, role")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "Somente administradores podem criar jobs." }, { status: 403 });
    }

    const commercialJobAccess = await assertAgencyActionAllowed({
      supabase,
      agencyId: profile.agency_id,
      action: "create_job"
    });

    if (!commercialJobAccess.allowed) {
      return NextResponse.json(
        { error: commercialJobAccess.message ?? "A criação de jobs está indisponível para a sua assinatura." },
        { status: 403 }
      );
    }

    if (parsed.data.tasks.length > 0) {
      const canCreateTask = await assertAgencyActionAllowed({
        supabase,
        agencyId: profile.agency_id,
        action: "create_task"
      });

      if (!canCreateTask.allowed) {
        return NextResponse.json(
          { error: canCreateTask.message ?? "A criação de tarefas está indisponível para a sua assinatura." },
          { status: 403 }
        );
      }
    }

    const { data: client, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .eq("id", parsed.data.client_id)
      .eq("agency_id", profile.agency_id)
      .single();

    if (clientError) {
      return NextResponse.json(
        { error: `Falha ao carregar o cliente selecionado: ${clientError.message}` },
        { status: 400 }
      );
    }

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
    }

    // `prefix` was introduced in a later migration. If the column does not exist yet,
    // we gracefully fall back to generating the code from the client name.
    let prefixFromDb: string | null = null;

    const { data: clientPrefixData, error: clientPrefixError } = await supabase
      .from("clients")
      .select("prefix")
      .eq("id", parsed.data.client_id)
      .eq("agency_id", profile.agency_id)
      .maybeSingle();

    if (!clientPrefixError && clientPrefixData) {
      prefixFromDb = clientPrefixData.prefix ?? null;
    }

    const clientPrefix = resolveClientPrefix({
      prefixFromDb,
      clientName: client.name
    });

    const assigneeIds = [...new Set(parsed.data.tasks.flatMap((task) => task.assignee_ids))];
    let assigneeMap = new Map<string, string>();

    if (assigneeIds.length > 0) {
      const { data: assigneeUsers, error: assigneeError } = await supabase
        .from("users")
        .select("id, name")
        .eq("agency_id", profile.agency_id)
        .in("id", assigneeIds);

      if (assigneeError) {
        return NextResponse.json({ error: assigneeError.message }, { status: 400 });
      }

      assigneeMap = new Map((assigneeUsers ?? []).map((user) => [user.id, user.name]));

      if (assigneeMap.size !== assigneeIds.length) {
        return NextResponse.json({ error: "Um ou mais responsáveis são inválidos para esta agência." }, { status: 400 });
      }
    }

    let createdJob: { id: string; job_code: string | null } | null = null;
    const omittedJobColumns = new Set<string>();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const jobCode = await generateNextJobCode({
        supabase,
        agencyId: profile.agency_id,
        clientId: client.id,
        clientPrefix
      });

      const jobPayload: Record<string, unknown> = {
        agency_id: profile.agency_id,
        client_id: parsed.data.client_id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        status: parsed.data.status,
        due_date: parsed.data.due_date || null,
        created_by: profile.id
      };

      if (parsed.data.client_need) {
        jobPayload.client_need = parsed.data.client_need;
      }

      if (parsed.data.start_date) {
        jobPayload.start_date = parsed.data.start_date;
      }

      if (parsed.data.start_time) {
        jobPayload.start_time = parsed.data.start_time;
      }

      if (parsed.data.due_time) {
        jobPayload.due_time = parsed.data.due_time;
      }

      if (jobCode) {
        jobPayload.job_code = jobCode;
      }

      try {
        const insertedJob = await insertJobWithCompatibility({
          supabase,
          payload: jobPayload
        });

        insertedJob.omittedColumns.forEach((column) => omittedJobColumns.add(column));
        createdJob = {
          id: insertedJob.data.id,
          job_code: typeof jobPayload.job_code === "string" ? jobPayload.job_code : null
        };
        break;
      } catch (insertError) {
        const errorMessage = insertError instanceof Error ? insertError.message : "Falha ao criar job.";

        if (errorMessage.includes("duplicate key value")) {
          continue;
        }

        return NextResponse.json({ error: errorMessage }, { status: 400 });
      }
    }

    if (!createdJob) {
      return NextResponse.json({ error: "Não foi possível gerar um código único para o job." }, { status: 409 });
    }

    await createJobEvent({
      supabase,
      jobId: createdJob.id,
      userId: profile.id,
      eventType: "job_created",
      description: "Job criado"
    });

    if (parsed.data.description) {
      await createJobEvent({
        supabase,
        jobId: createdJob.id,
        userId: profile.id,
        eventType: "briefing_updated",
        description: "Briefing atualizado"
      });
    }

    let failedTaskCount = 0;
    const omittedTaskColumns = new Set<string>();

    if (parsed.data.tasks.length > 0) {
      for (const [index, task] of parsed.data.tasks.entries()) {
        const taskPayload: Record<string, unknown> = {
          agency_id: profile.agency_id,
          job_id: createdJob.id,
          title: task.title,
          description: task.description || null,
          assigned_to: task.assignee_ids[0] ?? null,
          priority: task.priority,
          status: task.status,
          estimated_hours: 1,
          due_date: task.due_date || null,
          position: (index + 1) * 1000
        };

        if (task.due_time) {
          taskPayload.due_time = task.due_time;
        }

        let insertedTask: { id: string } | null = null;

        try {
          const insertedTaskResult = await insertTaskWithCompatibility({
            supabase,
            payload: taskPayload
          });
          insertedTask = insertedTaskResult.data;
          insertedTaskResult.omittedColumns.forEach((column) => omittedTaskColumns.add(column));
        } catch {
          failedTaskCount += 1;
          continue;
        }

        await createJobEvent({
          supabase,
          jobId: createdJob.id,
          userId: profile.id,
          eventType: "task_created",
          description: `Tarefa "${task.title}" adicionada`
        });

        if (task.status === "concluido") {
          await createJobEvent({
            supabase,
            jobId: createdJob.id,
            userId: profile.id,
            eventType: "task_completed",
            description: `Tarefa "${task.title}" concluída`
          });
        }

        if (task.assignee_ids.length > 0) {
          const assigneeId = task.assignee_ids[0];
          if (!assigneeId) continue;
          const assigneesPayload = {
            agency_id: profile.agency_id,
            task_id: insertedTask.id,
            user_id: assigneeId
          };

          const { error: assigneeError } = await supabase.from("task_assignees").upsert(assigneesPayload, {
            onConflict: "task_id,user_id"
          });

          if (assigneeError) {
            failedTaskCount += 1;
            continue;
          }

          const assigneeName = assigneeMap.get(assigneeId) ?? assigneeId;

          await createJobEvent({
            supabase,
            jobId: createdJob.id,
            userId: profile.id,
            eventType: "assignee_defined",
            description: `Responsável definido para "${task.title}": ${assigneeName}`
          });
        }
      }
    }

    let warning: string | null = null;
    let driveFolderUrl: string | null = null;

    if (failedTaskCount > 0) {
      warning = `${failedTaskCount} tarefa(s) não puderam ser criada(s) automaticamente no job.`;
    }

    if (omittedJobColumns.size > 0 || omittedTaskColumns.size > 0) {
      warning = appendWarning(
        warning,
        "Job criado com compatibilidade para banco antigo. Alguns campos opcionais nao foram salvos porque ainda faltam migrations no Supabase."
      );
    }

    let adminClient: ReturnType<typeof createAdminSupabaseClient> | null = null;

    try {
      adminClient = createAdminSupabaseClient();
    } catch {
      warning = appendWarning(warning, "Job criado, mas a integração Google Drive não está configurada no servidor.");
    }

    if (adminClient && commercialJobAccess.context.permissions.google_drive.allowed) {
      const { data: integration, error: integrationError } = await adminClient
        .from("agency_integrations")
        .select("id, access_token, refresh_token, root_folder_id")
        .eq("agency_id", profile.agency_id)
        .eq("provider", "google_drive")
        .maybeSingle();

      if (integrationError) {
        warning = appendWarning(warning, "Job criado, mas a integração Google Drive não pôde ser verificada.");
      } else if (integration?.root_folder_id) {
        try {
          const refreshed = await refreshGoogleAccessToken(integration.refresh_token);
          const folder = await createJobFolder({
            accessToken: refreshed.accessToken,
            rootFolderId: integration.root_folder_id,
            jobCode: createdJob.job_code ?? "JOB"
          });

          driveFolderUrl = folder.folderUrl;

          await supabase
            .from("jobs")
            .update({
              drive_folder_id: folder.folderId,
              drive_folder_url: folder.folderUrl
            })
            .eq("id", createdJob.id)
            .eq("agency_id", profile.agency_id);

          await createJobEvent({
            supabase,
            jobId: createdJob.id,
            userId: profile.id,
            eventType: "file_attached",
            description: "Pasta do Google Drive vinculada ao job"
          });

          await adminClient
            .from("agency_integrations")
            .update({
              access_token: refreshed.accessToken,
              refresh_token: refreshed.refreshToken ?? integration.refresh_token
            })
            .eq("id", integration.id);
        } catch (driveError) {
          warning = appendWarning(
            warning,
            driveError instanceof Error
              ? `Job criado, mas não foi possível criar a pasta no Google Drive: ${driveError.message}`
              : "Job criado, mas não foi possível criar a pasta no Google Drive."
          );
        }
      } else if (integration && !integration.root_folder_id) {
        warning = appendWarning(
          warning,
          "Job criado. Defina a pasta raiz do Google Drive para habilitar a criação automática de pastas."
        );
      }
    } else if (adminClient && !commercialJobAccess.context.permissions.google_drive.allowed) {
      warning = appendWarning(
        warning,
        commercialJobAccess.context.permissions.google_drive.message ??
          "O plano atual não permite integração com Google Drive."
      );
    }

    return NextResponse.json(
      {
        success: true,
        jobId: createdJob.id,
        jobCode: createdJob.job_code,
        driveFolderUrl,
        warning
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar job." },
      { status: 500 }
    );
  }
}
