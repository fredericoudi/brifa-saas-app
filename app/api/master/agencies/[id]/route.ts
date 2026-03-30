import { NextResponse } from "next/server";
import { z } from "zod";
import type { Agency, AgencyInvitation, Database } from "@/lib/database.types";
import { isReservedAgencySlug } from "@/lib/agency-routing";
import { COMMERCIAL_PLAN_CODES, COMMERCIAL_SUBSCRIPTION_STATUSES } from "@/lib/commercial";
import { buildAgencyActivationLink, computeActivationExpiry, generateActivationToken, normalizeAgencySlug } from "@/lib/master";
import { getRequestOrigin, requireSuperAdminApi } from "@/lib/master-server";
import { upsertAgencySubscription } from "@/lib/subscription-admin";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const updateAgencySchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(1).max(120),
  plan: z.enum(COMMERCIAL_PLAN_CODES),
  status: z.enum(COMMERCIAL_SUBSCRIPTION_STATUSES),
  adminEmail: z.string().trim().email().optional().nullable(),
  adminName: z.string().trim().max(120).optional().nullable(),
  trialStartsAt: z.string().trim().optional().nullable(),
  trialEndsAt: z.string().trim().optional().nullable(),
  regenerateActivationLink: z.boolean().optional().default(false)
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

function resolveAgencyOperationalStatus(status: Database["public"]["Enums"]["subscription_status"]) {
  if (status === "suspended") return "suspended" as const;
  if (status === "trial") return "trial" as const;
  if (status === "pending_payment") return "pending_payment" as const;
  return "active" as const;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await requireSuperAdminApi();
    if (auth.errorResponse) {
      return auth.errorResponse;
    }

    const parsed = updateAgencySchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos para atualizar a agência." }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();
    const normalizedSlug = normalizeAgencySlug(parsed.data.slug);

    if (!normalizedSlug) {
      return NextResponse.json({ error: "Informe um slug válido para a agência." }, { status: 400 });
    }

    if (isReservedAgencySlug(normalizedSlug)) {
      return NextResponse.json(
        { error: "Esse slug é reservado pelo sistema. Escolha outro identificador para a agência." },
        { status: 400 }
      );
    }

    const [{ data: rawAgency, error: agencyError }, { data: conflictingAgency }] = await Promise.all([
      admin
        .from("agencies")
        .select("*")
        .eq("id", params.id)
        .maybeSingle(),
      admin
        .from("agencies")
        .select("id")
        .eq("slug", normalizedSlug)
        .neq("id", params.id)
        .maybeSingle()
    ]);

    const agency = rawAgency as Agency | null;

    if (agencyError || !agency) {
      return NextResponse.json({ error: "Agência não encontrada." }, { status: 404 });
    }

    if (conflictingAgency) {
      return NextResponse.json({ error: "Já existe outra agência com esse slug." }, { status: 409 });
    }

    const trialStartsAt = toTimestamp(parsed.data.trialStartsAt);
    const trialEndsAt = toTimestamp(parsed.data.trialEndsAt);

    if (trialStartsAt && trialEndsAt && new Date(trialStartsAt) > new Date(trialEndsAt)) {
      return NextResponse.json({ error: "A data final do trial deve ser posterior à data inicial." }, { status: 400 });
    }

    const { data: rawUpdatedAgency, error: updateError } = await admin
      .from("agencies")
      .update({
        name: parsed.data.name,
        slug: normalizedSlug,
        plan: parsed.data.plan === "growth" ? "growth" : (parsed.data.plan as Agency["plan"]),
        status: resolveAgencyOperationalStatus(parsed.data.status)
      })
      .eq("id", params.id)
      .select("*")
      .single();

    const updatedAgency = rawUpdatedAgency as Agency | null;

    if (updateError || !updatedAgency) {
      return NextResponse.json({ error: updateError?.message ?? "Não foi possível atualizar a agência." }, { status: 400 });
    }

    await upsertAgencySubscription({
      supabase: admin,
      agencyId: params.id,
      planCode: parsed.data.plan,
      status: parsed.data.status,
      trialStartsAt,
      trialEndsAt
    });

    const { data: rawPendingInvitation } = await admin
      .from("agency_invitations")
      .select("*")
      .eq("agency_id", params.id)
      .eq("invitation_type", "agency_admin_activation")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .maybeSingle();

    const pendingInvitation = rawPendingInvitation as AgencyInvitation | null;

    let activationLink: string | null = null;
    let activationInvitation = pendingInvitation ?? null;
    const normalizedEmail = parsed.data.adminEmail?.toLowerCase() ?? pendingInvitation?.email ?? null;
    const normalizedName = parsed.data.adminName || pendingInvitation?.name || null;

    if (parsed.data.regenerateActivationLink) {
      if (pendingInvitation) {
        await admin
          .from("agency_invitations")
          .update({
            status: "cancelled",
            updated_at: new Date().toISOString()
          })
          .eq("id", pendingInvitation.id);
      }

      if (!normalizedEmail) {
        return NextResponse.json(
          { error: "Informe o e-mail do administrador inicial para gerar um novo link de ativação." },
          { status: 400 }
        );
      }

      const token = generateActivationToken();
      const expiresAt = computeActivationExpiry();
      const { data: rawCreatedInvitation, error: invitationError } = await admin
        .from("agency_invitations")
        .insert({
          agency_id: params.id,
          email: normalizedEmail,
          name: normalizedName,
          token,
          invitation_type: "agency_admin_activation",
          status: "pending",
          expires_at: expiresAt,
          created_by: auth.profile.id
        })
        .select("*")
        .single();

      const createdInvitation = rawCreatedInvitation as AgencyInvitation | null;

      if (invitationError || !createdInvitation) {
        return NextResponse.json(
          { error: invitationError?.message ?? "Agência atualizada, mas não foi possível gerar um novo link." },
          { status: 400 }
        );
      }

      activationInvitation = createdInvitation;
    } else if (pendingInvitation && normalizedEmail) {
      const { data: rawRefreshedInvitation, error: invitationError } = await admin
        .from("agency_invitations")
        .update({
          email: normalizedEmail,
          name: normalizedName,
          updated_at: new Date().toISOString()
        })
        .eq("id", pendingInvitation.id)
        .select("*")
        .single();

      const refreshedInvitation = rawRefreshedInvitation as AgencyInvitation | null;

      if (!invitationError && refreshedInvitation) {
        activationInvitation = refreshedInvitation;
      }
    }

    if (activationInvitation) {
      const origin = getRequestOrigin();
      activationLink = buildAgencyActivationLink({
        origin,
        slug: updatedAgency.slug,
        token: activationInvitation.token
      });
    }

    return NextResponse.json({
      agency: updatedAgency,
      invitation: activationInvitation,
      activationLink
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro inesperado ao atualizar a agência." },
      { status: 500 }
    );
  }
}
