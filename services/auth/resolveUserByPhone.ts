import type { UserProfile } from "@/lib/database.types";
import { isValidPhoneNumber, normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type ResolvedPhoneUser = Pick<
  UserProfile,
  | "id"
  | "agency_id"
  | "name"
  | "email"
  | "role"
  | "agency_role"
  | "phone_number"
  | "whatsapp_enabled"
  | "is_active"
>;

export async function resolveUserByPhone(
  phone: string,
  options?: {
    expectedAgencyId?: string;
  }
) {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone || !isValidPhoneNumber(normalizedPhone)) {
    return {
      ok: false as const,
      message: "Número inválido. Informe o telefone no formato 5511999999999."
    };
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("users")
    .select("id, agency_id, name, email, role, agency_role, phone_number, whatsapp_enabled, is_active")
    .eq("phone_number", normalizedPhone)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      ok: false as const,
      message: "Seu número não está vinculado ao BRIFA. Fale com o administrador da sua agência."
    };
  }

  const user = data as ResolvedPhoneUser;

  if (options?.expectedAgencyId && user.agency_id !== options.expectedAgencyId) {
    return {
      ok: false as const,
      message: "Seu número não está vinculado a esta agência. Fale com o administrador da sua agência."
    };
  }

  if (!user.is_active) {
    return {
      ok: false as const,
      message: "Seu acesso ao BRIFA está inativo. Fale com o administrador da sua agência."
    };
  }

  if (!user.whatsapp_enabled) {
    return {
      ok: false as const,
      message: "Seu acesso conversacional está desabilitado. Fale com o administrador da sua agência."
    };
  }

  return {
    ok: true as const,
    phoneNumber: normalizedPhone,
    user
  };
}
