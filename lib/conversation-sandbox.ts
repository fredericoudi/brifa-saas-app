import { NextResponse } from "next/server";
import type { UserProfile } from "@/lib/database.types";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  SandboxAction,
  SandboxDebugState,
  SandboxMessage,
  SandboxSelectableUser,
  SandboxSnapshot
} from "@/components/conversations/sandbox/types";

type SandboxAccessProfile = Pick<
  UserProfile,
  "id" | "agency_id" | "role" | "platform_role" | "name" | "email"
>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function buildDebugFromAction(action: SandboxAction | null): SandboxDebugState | null {
  if (!action) {
    return null;
  }

  const payload = asRecord(action.payload);
  const result = asRecord(action.result);
  const entities = asRecord(payload?.entities);

  return {
    intent: action.action_type,
    confidence: asNumber(payload?.confidence),
    entities,
    actionType: action.action_type,
    status: action.status,
    response: asString(result?.response),
    error: asString(result?.error),
    payload,
    result
  };
}

export async function requireConversationSandboxAccessApi() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      errorResponse: NextResponse.json({ error: "Não autenticado." }, { status: 401 }),
      user: null,
      profile: null
    };
  }

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, agency_id, role, platform_role, name, email")
    .eq("id", user.id)
    .maybeSingle();

  const typedProfile = (profile as SandboxAccessProfile | null) ?? null;

  if (error || !typedProfile) {
    return {
      errorResponse: NextResponse.json({ error: "Perfil não encontrado." }, { status: 403 }),
      user,
      profile: null
    };
  }

  const allowed = typedProfile.role === "admin" || typedProfile.platform_role === "super_admin";
  if (!allowed) {
    return {
      errorResponse: NextResponse.json({ error: "Acesso restrito a administradores." }, { status: 403 }),
      user,
      profile: typedProfile
    };
  }

  return {
    errorResponse: null,
    user,
    profile: typedProfile
  };
}

export async function listConversationSandboxUsers(agencyId: string): Promise<SandboxSelectableUser[]> {
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from("users")
    .select("id, name, email, avatar_url, updated_at, role, agency_role, phone_number, whatsapp_enabled, is_active")
    .eq("agency_id", agencyId)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as SandboxSelectableUser[]).map((user) => ({
    ...user,
    whatsapp_enabled: user.whatsapp_enabled ?? true,
    is_active: user.is_active ?? true
  }));
}

export async function getConversationSandboxUser({
  agencyId,
  userId
}: {
  agencyId: string;
  userId: string;
}): Promise<SandboxSelectableUser | null> {
  const users = await listConversationSandboxUsers(agencyId);
  return users.find((user) => user.id === userId) ?? null;
}

export async function getConversationSandboxSnapshot({
  agencyId,
  userId
}: {
  agencyId: string;
  userId: string;
}): Promise<SandboxSnapshot> {
  const admin = createAdminSupabaseClient();

  const { data: threadData, error: threadError } = await admin
    .from("conversation_threads")
    .select("id, channel, started_at, updated_at")
    .eq("agency_id", agencyId)
    .eq("user_id", userId)
    .eq("channel", "internal_test")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (threadError) {
    throw new Error(threadError.message);
  }

  if (!threadData) {
    return {
      thread: null,
      messages: [],
      recentActions: [],
      debug: null
    };
  }

  const thread = {
    id: threadData.id,
    channel: threadData.channel,
    started_at: threadData.started_at,
    updated_at: threadData.updated_at
  };

  const [messagesResponse, actionsResponse] = await Promise.all([
    admin
      .from("conversation_messages")
      .select("id, sender_type, message_text, intent, created_at")
      .eq("agency_id", agencyId)
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: true })
      .limit(80),
    admin
      .from("conversation_actions")
      .select("id, action_type, status, payload, result, created_at")
      .eq("agency_id", agencyId)
      .eq("thread_id", thread.id)
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  if (messagesResponse.error) {
    throw new Error(messagesResponse.error.message);
  }

  if (actionsResponse.error) {
    throw new Error(actionsResponse.error.message);
  }

  const messages = ((messagesResponse.data ?? []) as SandboxMessage[]).map((message) => ({
    ...message
  }));

  const recentActions = ((actionsResponse.data ?? []) as SandboxAction[]).map((action) => ({
    ...action,
    payload: asRecord(action.payload),
    result: asRecord(action.result)
  }));

  return {
    thread,
    messages,
    recentActions,
    debug: buildDebugFromAction(recentActions[0] ?? null)
  };
}
