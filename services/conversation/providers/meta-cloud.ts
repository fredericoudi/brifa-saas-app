import crypto from "node:crypto";
import type { AgencyChannel } from "@/lib/database.types";
import { normalizePhoneNumber } from "@/lib/phone";
import type {
  NormalizedInboundMessage,
  ReceiveMessageInput,
  SendTextMessageInput,
  SendTextMessageResult,
  WhatsAppProviderAdapter
} from "@/services/conversation/providers/types";

function timingSafeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
}

export function validateMetaWebhookSignature({
  rawBody,
  signatureHeader,
  appSecret
}: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret?: string | null;
}) {
  if (!appSecret) {
    return process.env.NODE_ENV !== "production";
  }

  if (!signatureHeader) {
    return false;
  }

  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return timingSafeEqual(expected, signatureHeader);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseMetaCloudWebhookPayload(payload: unknown): NormalizedInboundMessage[] {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    return [];
  }

  const entries = Array.isArray(payload.entry) ? payload.entry : [];
  const messages: NormalizedInboundMessage[] = [];

  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      const value = change.value as Record<string, unknown>;
      const metadata = isRecord(value.metadata) ? value.metadata : {};
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const inboundMessages = Array.isArray(value.messages) ? value.messages : [];

      for (const rawMessage of inboundMessages) {
        if (!isRecord(rawMessage)) continue;
        if (rawMessage.type !== "text") continue;

        const textBody = isRecord(rawMessage.text) ? readString(rawMessage.text.body) : null;
        const from = readString(rawMessage.from);
        if (!textBody || !from) continue;

        const normalizedFrom = normalizePhoneNumber(from);
        if (!normalizedFrom) continue;

        const matchingContact = contacts.find((contact) => isRecord(contact) && readString(contact.wa_id) === from);
        const profile = matchingContact && isRecord(matchingContact.profile) ? matchingContact.profile : null;

        messages.push({
          provider: "meta_cloud",
          fromPhoneNumber: normalizedFrom,
          text: textBody,
          externalContactId: normalizedFrom,
          channelPhoneNumber: normalizePhoneNumber(readString(metadata.display_phone_number)),
          externalAccountId: readString(metadata.phone_number_id),
          externalMessageId: readString(rawMessage.id),
          timestamp: readString(rawMessage.timestamp),
          profileName: profile ? readString(profile.name) : null,
          rawPayload: rawMessage
        });
      }
    }
  }

  return messages;
}

async function receiveMetaMessage(input: ReceiveMessageInput): Promise<NormalizedInboundMessage[]> {
  return parseMetaCloudWebhookPayload(input.payload);
}

async function sendMetaTextMessage(input: SendTextMessageInput): Promise<SendTextMessageResult> {
  const { channel, to, text } = input;
  const phoneNumberId = channel.external_account_id?.trim();
  const accessToken = channel.access_token?.trim();

  if (!phoneNumberId || !accessToken) {
    return {
      ok: false,
      error: "O canal Meta Cloud API precisa de phone_number_id e access token para responder mensagens."
    };
  }

  const apiVersion = process.env.WHATSAPP_META_API_VERSION?.trim() || "v22.0";
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text
      }
    })
  });

  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok) {
    const message = typeof raw?.error === "object" && raw?.error && "message" in raw.error ? String(raw.error.message) : `Falha ao enviar mensagem pelo Meta Cloud API (${response.status}).`;
    return {
      ok: false,
      error: message,
      raw
    };
  }

  const externalMessageId = Array.isArray(raw?.messages) && raw?.messages[0] && typeof raw.messages[0] === "object" && raw.messages[0] !== null && "id" in raw.messages[0]
    ? String((raw.messages[0] as { id?: unknown }).id ?? "") || null
    : null;

  return {
    ok: true,
    externalMessageId,
    raw
  };
}

export const metaCloudProvider: WhatsAppProviderAdapter = {
  provider: "meta_cloud",
  receiveMessage: receiveMetaMessage,
  sendTextMessage: sendMetaTextMessage
};

export function matchesMetaVerifyToken(channel: AgencyChannel, verifyToken: string) {
  return channel.provider === "meta_cloud" && channel.is_active && channel.webhook_verify_token === verifyToken;
}
