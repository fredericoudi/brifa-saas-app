import { NextResponse } from "next/server";
import { z } from "zod";
import { assertAgencyActionAllowed } from "@/lib/commercial";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const createClientSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório.").max(180),
  prefix: z.string().trim().max(8).optional().nullable(),
  company: z.string().trim().max(180).optional().nullable(),
  email: z.string().trim().email("E-mail inválido.").optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  notes: z.string().trim().max(12000).optional().nullable()
});

export async function POST(request: Request) {
  try {
    const parsed = createClientSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos para criação do cliente." }, { status: 400 });
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
      .select("id, agency_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 });
    }

    const commercialAccess = await assertAgencyActionAllowed({
      supabase,
      agencyId: profile.agency_id,
      action: "create_client"
    });

    if (!commercialAccess.allowed) {
      if (commercialAccess.reason === "limit_reached") {
        return NextResponse.json(
          {
            error: "LIMIT_REACHED",
            type: "CLIENT",
            message: commercialAccess.message ?? "Você atingiu o limite do plano Starter",
            trialActivated: commercialAccess.context.trial.activated
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: commercialAccess.message ?? "A criação de clientes está indisponível para esta assinatura." },
        { status: 403 }
      );
    }

    const normalizedPrefix = parsed.data.prefix?.trim().toUpperCase() || null;

    const { data: createdClient, error: createError } = await supabase
      .from("clients")
      .insert({
        agency_id: profile.agency_id,
        name: parsed.data.name,
        prefix: normalizedPrefix,
        company: parsed.data.company?.trim() || null,
        email: parsed.data.email?.trim() || null,
        phone: parsed.data.phone?.trim() || null,
        notes: parsed.data.notes?.trim() || null
      })
      .select("*")
      .single();

    if (createError || !createdClient) {
      return NextResponse.json({ error: createError?.message ?? "Não foi possível criar o cliente." }, { status: 400 });
    }

    return NextResponse.json({ client: createdClient }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao criar cliente." },
      { status: 500 }
    );
  }
}
