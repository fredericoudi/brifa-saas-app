import { NextResponse } from "next/server";
import { z } from "zod";
import type { Agency, AgencyInvitation } from "@/lib/database.types";
import { isReservedAgencySlug } from "@/lib/agency-routing";
import { COMMERCIAL_PLAN_CODES, COMMERCIAL_SUBSCRIPTION_STATUSES } from "@/lib/commercial";
import { buildAgencyActivationLink, computeActivationExpiry, generateActivationToken, normalizeAgencySlug } from "@/lib/master";
import { getRequestOrigin, requireSuperAdminApi } from "@/lib/master-server";
import { upsertAgencySubscription } from "@/lib/subscription-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const createAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(120).optional().nullable(),
  plan: z.enum(COMMERCIAL_PLAN_CODES).default("starter"),
  status: z.enum(COMMERCIAL_SUBSCRIPTION_STATUSES).default("trial"),
  adminEmail: z.string().trim().email(),
  adminName: z.string().trim().max(120).optional().nullable(),
  trialStartsAt: z.string().trim().optional().nullable(),
  trialEndsAt: z.string().trim().optional().nullable()
});

function toTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value.length === 10 ? `${value}T00:00:00.000Z` : value;
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Informe datas válidas para o trial.");
  }

  return date.toISOString();
}

export async function POST(request: Request) {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const parsed = createAgencySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para cadastrar a agência." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const normalizedSlug = normalizeAgencySlug(parsed.data.slug || parsed.data.name);

    if (!normalizedSlug) {
      return NextResponse.json({ error: "Informe um slug válido para a agência." }, { status: 400 });
    }

    if (isReservedAgencySlug(normalizedSlug)) {
      return NextResponse.json(
        { error: "Esse slug é reservado pelo sistema. Escolha outro identificador para a agência." },
        { status: 400 }
      );
    }

    const { data: existingSlug } = await admin
      .from("agencies")
      .select("id")
      .eq("slug", normalizedSlug)
      .maybeSingle();

    if (existingSlug) {
      return NextResponse.json({ error: "Já existe uma agência com esse slug." }, { status: 409 });
    }

    const trialStartsAt = toTimestamp(parsed.data.trialStartsAt);
    const trialEndsAt = toTimestamp(parsed.data.trialEndsAt);

    if (trialStartsAt && trialEndsAt && new Date(trialStartsAt) > new Date(trialEndsAt)) {
      return NextResponse.json({ error: "A data final do trial deve ser posterior à data inicial." }, { status: 400 });
    }

    const { data: insertedAgency, error: agencyError } = await admin
      .from("agencies")
      .insert({
        name: parsed.data.name,
        slug: normalizedSlug,
        plan: parsed.data.plan === "growth" ? "growth" : (parsed.data.plan as Agency["plan"]),
        status: "active",
        trial_starts_at: parsed.data.status === "trial" ? trialStartsAt ?? new Date().toISOString() : trialStartsAt,
        trial_ends_at: parsed.data.status === "trial" ? trialEndsAt : null
      })
      .select("*")
      .single();

    const agency = insertedAgency as Agency | null;

    if (agencyError || !agency) {
      return NextResponse.json({ error: agencyError?.message ?? "Não foi possível cadastrar a agência." }, { status: 400 });
    }

    await upsertAgencySubscription({
      supabase: admin,
      agencyId: agency.id,
      planCode: parsed.data.plan,
      status: parsed.data.status,
      trialStartsAt,
      trialEndsAt
    });

    const token = generateActivationToken();
    const expiresAt = computeActivationExpiry();

    const { data: insertedInvitation, error: invitationError } = await admin
      .from("agency_invitations")
      .insert({
        agency_id: agency.id,
        email: parsed.data.adminEmail.toLowerCase(),
        name: parsed.data.adminName || null,
        token,
        invitation_type: "agency_admin_activation",
        status: "pending",
        expires_at: expiresAt,
        created_by: auth.profile.id
      })
      .select("*")
      .single();

    const invitation = insertedInvitation as AgencyInvitation | null;

    if (invitationError || !invitation) {
      return NextResponse.json(
        { error: invitationError?.message ?? "Agência criada, mas não foi possível gerar o link de ativação." },
        { status: 400 }
      );
    }

    const origin = getRequestOrigin();
    const activationLink = buildAgencyActivationLink({
      origin,
      slug: agency.slug,
      token: invitation.token
    });

    return NextResponse.json({
      agency,
      invitation,
      activationLink
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao cadastrar a agência." },
      { status: 500 }
    );
  }
}
