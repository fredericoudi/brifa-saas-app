import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  AgencyChannel,
  ConversationAction,
  ConversationRecordMessage,
  ConversationThread,
  UserProfile
} from "@/lib/database.types";

export type SanitizedAgencyChannel = Pick<
  AgencyChannel,
  | "id"
  | "provider"
  | "phone_number"
  | "external_account_id"
  | "webhook_verify_token"
  | "is_active"
  | "updated_at"
> & {
  has_access_token: boolean;
  has_refresh_token: boolean;
};

export type AgencyConversationOverview = {
  channel: SanitizedAgencyChannel | null;
  recentMessages: Array<
    Pick<ConversationRecordMessage, "id" | "thread_id" | "sender_type" | "message_text" | "intent" | "created_at"> & {
      thread: Pick<ConversationThread, "external_contact_id" | "channel"> | null;
      userName: string | null;
    }
  >;
  recentActions: Array<
    Pick<ConversationAction, "id" | "action_type" | "status" | "created_at" | "payload" | "result"> & {
      userName: string | null;
    }
  >;
  metrics: {
    totalThreads: number;
    totalMessages: number;
    totalActions: number;
  };
};

export function sanitizeAgencyChannel(channel: AgencyChannel | null): SanitizedAgencyChannel | null {
  if (!channel) {
    return null;
  }

  return {
    id: channel.id,
    provider: channel.provider,
    phone_number: channel.phone_number,
    external_account_id: channel.external_account_id,
    webhook_verify_token: channel.webhook_verify_token,
    is_active: channel.is_active,
    updated_at: channel.updated_at,
    has_access_token: Boolean(channel.access_token?.trim()),
    has_refresh_token: Boolean(channel.refresh_token?.trim())
  };
}

export async function getAgencyConversationOverview(agencyId: string): Promise<AgencyConversationOverview> {
  const admin = createAdminSupabaseClient();

  const [channelResponse, threadCountResponse, messageCountResponse, actionCountResponse, messagesResponse, actionsResponse] =
    await Promise.all([
      admin
        .from("agency_channels")
        .select("*")
        .eq("agency_id", agencyId)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("conversation_threads").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      admin.from("conversation_messages").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      admin.from("conversation_actions").select("id", { count: "exact", head: true }).eq("agency_id", agencyId),
      admin
        .from("conversation_messages")
        .select("id, thread_id, user_id, sender_type, message_text, intent, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(12),
      admin
        .from("conversation_actions")
        .select("id, user_id, action_type, status, payload, result, created_at")
        .eq("agency_id", agencyId)
        .order("created_at", { ascending: false })
        .limit(12)
    ]);

  if (channelResponse.error) {
    throw new Error(channelResponse.error.message);
  }
  if (messagesResponse.error) {
    throw new Error(messagesResponse.error.message);
  }
  if (actionsResponse.error) {
    throw new Error(actionsResponse.error.message);
  }

  const recentMessagesRaw = (messagesResponse.data ?? []) as Array<
    Pick<ConversationRecordMessage, "id" | "thread_id" | "user_id" | "sender_type" | "message_text" | "intent" | "created_at">
  >;
  const recentActionsRaw = (actionsResponse.data ?? []) as Array<
    Pick<ConversationAction, "id" | "user_id" | "action_type" | "status" | "payload" | "result" | "created_at">
  >;

  const threadIds = Array.from(new Set(recentMessagesRaw.map((message) => message.thread_id)));
  const userIds = Array.from(
    new Set(
      [...recentMessagesRaw.map((message) => message.user_id), ...recentActionsRaw.map((action) => action.user_id)].filter(
        (value): value is string => Boolean(value)
      )
    )
  );

  const [threadResponse, usersResponse] = await Promise.all([
    threadIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from("conversation_threads")
          .select("id, external_contact_id, channel")
          .in("id", threadIds),
    userIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : admin
          .from("users")
          .select("id, name")
          .in("id", userIds)
  ]);

  if (threadResponse.error) {
    throw new Error(threadResponse.error.message);
  }
  if (usersResponse.error) {
    throw new Error(usersResponse.error.message);
  }

  const threadMap = new Map(
    ((threadResponse.data ?? []) as Array<Pick<ConversationThread, "id" | "external_contact_id" | "channel">>).map(
      (thread) => [thread.id, thread]
    )
  );
  const userMap = new Map(
    ((usersResponse.data ?? []) as Array<Pick<UserProfile, "id" | "name">>).map((user) => [user.id, user.name])
  );

  return {
    channel: sanitizeAgencyChannel((channelResponse.data as AgencyChannel | null) ?? null),
    recentMessages: recentMessagesRaw.map((message) => ({
      id: message.id,
      thread_id: message.thread_id,
      sender_type: message.sender_type,
      message_text: message.message_text,
      intent: message.intent,
      created_at: message.created_at,
      thread: threadMap.get(message.thread_id) ?? null,
      userName: message.user_id ? userMap.get(message.user_id) ?? null : null
    })),
    recentActions: recentActionsRaw.map((action) => ({
      id: action.id,
      action_type: action.action_type,
      status: action.status,
      payload: action.payload,
      result: action.result,
      created_at: action.created_at,
      userName: action.user_id ? userMap.get(action.user_id) ?? null : null
    })),
    metrics: {
      totalThreads: threadCountResponse.count ?? 0,
      totalMessages: messageCountResponse.count ?? 0,
      totalActions: actionCountResponse.count ?? 0
    }
  };
}
