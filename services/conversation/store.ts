import type { Database } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type { ConversationProvider } from "@/services/conversation/providers/types";

type AgencyChannelRow = Database["public"]["Tables"]["agency_channels"]["Row"];
type ConversationThreadRow = Database["public"]["Tables"]["conversation_threads"]["Row"];

type JsonValue = Database["public"]["Tables"]["conversation_messages"]["Insert"]["metadata"];

export async function resolveActiveAgencyChannel({
  provider,
  externalAccountId,
  channelPhoneNumber
}: {
  provider: ConversationProvider;
  externalAccountId?: string | null;
  channelPhoneNumber?: string | null;
}) {
  if (provider === "internal_test") {
    return null;
  }

  const admin = createAdminSupabaseClient();
  let query = admin
    .from("agency_channels")
    .select("*")
    .eq("provider", provider)
    .eq("is_active", true);

  const normalizedChannelPhone = normalizePhoneNumber(channelPhoneNumber);
  if (externalAccountId?.trim()) {
    query = query.eq("external_account_id", externalAccountId.trim());
  } else if (normalizedChannelPhone) {
    query = query.eq("phone_number", normalizedChannelPhone);
  } else {
    return null;
  }

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as AgencyChannelRow | null) ?? null;
}

export async function getOrCreateConversationThread({
  agencyId,
  userId,
  channelId,
  externalContactId,
  channel
}: {
  agencyId: string;
  userId: string | null;
  channelId: string | null;
  externalContactId: string;
  channel: ConversationProvider;
}) {
  const admin = createAdminSupabaseClient();
  const normalizedExternalContactId = normalizePhoneNumber(externalContactId) ?? externalContactId;

  let query = admin
    .from("conversation_threads")
    .select("*")
    .eq("agency_id", agencyId)
    .eq("channel", channel)
    .eq("external_contact_id", normalizedExternalContactId)
    .order("updated_at", { ascending: false })
    .limit(1);

  query = channelId ? query.eq("channel_id", channelId) : query.is("channel_id", null);
  query = userId ? query.eq("user_id", userId) : query.is("user_id", null);

  const { data: existingThread, error: existingError } = await query.maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingThread) {
    return existingThread as ConversationThreadRow;
  }

  const { data: createdThread, error: createError } = await admin
    .from("conversation_threads")
    .insert({
      agency_id: agencyId,
      user_id: userId,
      channel_id: channelId,
      external_contact_id: normalizedExternalContactId,
      channel
    })
    .select("*")
    .single();

  if (createError || !createdThread) {
    throw new Error(createError?.message ?? "Falha ao criar thread da conversa.");
  }

  return createdThread as ConversationThreadRow;
}

export async function insertConversationMessage({
  threadId,
  agencyId,
  userId,
  senderType,
  messageText,
  intent,
  metadata
}: {
  threadId: string;
  agencyId: string;
  userId: string | null;
  senderType: Database["public"]["Tables"]["conversation_messages"]["Insert"]["sender_type"];
  messageText: string;
  intent?: string | null;
  metadata?: JsonValue;
}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("conversation_messages").insert({
    thread_id: threadId,
    agency_id: agencyId,
    user_id: userId,
    sender_type: senderType,
    message_text: messageText,
    intent: intent ?? null,
    metadata: metadata ?? null
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function insertConversationAction({
  agencyId,
  threadId,
  userId,
  actionType,
  status,
  payload,
  result
}: {
  agencyId: string;
  threadId?: string | null;
  userId?: string | null;
  actionType: string;
  status: string;
  payload?: Database["public"]["Tables"]["conversation_actions"]["Insert"]["payload"];
  result?: Database["public"]["Tables"]["conversation_actions"]["Insert"]["result"];
}) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("conversation_actions").insert({
    agency_id: agencyId,
    thread_id: threadId ?? null,
    user_id: userId ?? null,
    action_type: actionType,
    status,
    payload: payload ?? null,
    result: result ?? null
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function touchConversationThread(threadId: string) {
  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from("conversation_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  if (error) {
    console.error("Falha ao atualizar updated_at da thread:", error.message);
  }
}
