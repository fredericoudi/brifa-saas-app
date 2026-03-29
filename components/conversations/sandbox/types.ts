export type SandboxSelectableUser = {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  updated_at?: string;
  role: string;
  agency_role: string;
  phone_number: string | null;
  whatsapp_enabled: boolean;
  is_active: boolean;
};

export type SandboxAgencyContext = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
};

export type SandboxMessage = {
  id: string;
  sender_type: "user" | "assistant" | "system";
  message_text: string;
  intent: string | null;
  created_at: string;
};

export type SandboxAction = {
  id: string;
  action_type: string;
  status: string;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  created_at: string;
};

export type SandboxDebugState = {
  intent: string | null;
  confidence: number | null;
  entities: Record<string, unknown> | null;
  actionType: string | null;
  status: string | null;
  response: string | null;
  error: string | null;
  payload: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
};

export type SandboxThread = {
  id: string;
  channel: string;
  started_at: string;
  updated_at: string;
} | null;

export type SandboxSnapshot = {
  thread: SandboxThread;
  messages: SandboxMessage[];
  recentActions: SandboxAction[];
  debug: SandboxDebugState | null;
};

export type SandboxPostResponse = {
  ok: boolean;
  response: string;
  error?: string;
  selectedUser: SandboxSelectableUser;
  snapshot: SandboxSnapshot;
  debug: SandboxDebugState;
  ephemeralMessages?: SandboxMessage[];
};
