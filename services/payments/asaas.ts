import type { Json } from "@/lib/database.types";

const DEFAULT_ASAAS_API_BASE_URL = "https://api.asaas.com/v3";

type AsaasRequestOptions = RequestInit & {
  path: string;
};

type AsaasApiError = {
  description?: string;
};

type AsaasApiErrorResponse = {
  errors?: AsaasApiError[];
};

export type AsaasCustomer = {
  id: string;
  name?: string;
  email?: string | null;
  mobilePhone?: string | null;
};

export type AsaasCheckoutSession = {
  id: string;
  url: string;
  customer?: string | null;
  subscription?: string | null;
  raw: Json;
};

export type AsaasWebhookPayload = {
  event?: string;
  payment?: Record<string, unknown> | null;
  subscription?: Record<string, unknown> | null;
  checkout?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  [key: string]: unknown;
};

function getAsaasApiBaseUrl() {
  return (process.env.ASAAS_API_BASE_URL ?? DEFAULT_ASAAS_API_BASE_URL).replace(/\/$/, "");
}

function getAsaasApiKey() {
  const apiKey = process.env.ASAAS_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ASAAS_API_KEY não configurada.");
  }

  return apiKey;
}

function formatAsaasError(payload: AsaasApiErrorResponse | null | undefined) {
  const message = payload?.errors?.[0]?.description?.trim();
  return message || "A Asaas recusou a requisição.";
}

async function asaasRequest<T = Record<string, unknown>>({ path, headers, body, ...init }: AsaasRequestOptions): Promise<T> {
  const response = await fetch(`${getAsaasApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      access_token: getAsaasApiKey(),
      ...headers
    },
    body
  });

  const payload = (await response.json().catch(() => null)) as T | AsaasApiErrorResponse | null;

  if (!response.ok) {
    throw new Error(formatAsaasError(payload as AsaasApiErrorResponse | null));
  }

  return payload as T;
}

function resolveCheckoutUrl(raw: Record<string, unknown>) {
  const directUrl =
    (typeof raw.url === "string" && raw.url) ||
    (typeof raw.checkoutUrl === "string" && raw.checkoutUrl) ||
    (typeof raw.invoiceUrl === "string" && raw.invoiceUrl) ||
    null;

  if (directUrl) {
    return directUrl;
  }

  const checkoutBaseUrl = getAsaasApiBaseUrl().includes("sandbox")
    ? "https://sandbox.asaas.com/checkoutSession/show?id={id}"
    : "https://asaas.com/checkoutSession/show?id={id}";

  const template = process.env.ASAAS_CHECKOUT_URL_TEMPLATE?.trim() || checkoutBaseUrl;
  const checkoutId = typeof raw.id === "string" ? raw.id : null;

  if (template && checkoutId) {
    return template.replace("{id}", checkoutId);
  }

  throw new Error("A Asaas não retornou uma URL de checkout utilizável.");
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

export async function createAsaasCustomer(input: {
  name: string;
  email: string;
  phoneNumber: string;
  document: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  complement?: string | null;
  province: string;
  externalReference: string;
}) {
  const payload = (await asaasRequest<Record<string, unknown>>({
    path: "/customers",
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      mobilePhone: input.phoneNumber,
      phone: input.phoneNumber,
      cpfCnpj: input.document,
      postalCode: input.postalCode,
      address: input.address,
      addressNumber: input.addressNumber,
      complement: input.complement ?? undefined,
      province: input.province,
      externalReference: input.externalReference,
      notificationDisabled: false
    })
  })) as Record<string, unknown>;

  if (typeof payload.id !== "string" || !payload.id) {
    throw new Error("A Asaas não retornou o cliente criado.");
  }

  return payload as unknown as AsaasCustomer;
}

export async function createAsaasCheckoutSession(input: {
  agencyId: string;
  agencyName: string;
  customerId: string;
  planName: string;
  priceCents: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const nextDueDate = addMonths(new Date(), 1).toISOString().slice(0, 10);

  const raw = (await asaasRequest<Record<string, unknown>>({
    path: "/checkouts",
    method: "POST",
    body: JSON.stringify({
      name: `BRIFA — ${input.planName}`,
      description: `Assinatura mensal do plano ${input.planName} para a agência ${input.agencyName}.`,
      billingTypes: ["CREDIT_CARD"],
      chargeTypes: ["RECURRENT"],
      minutesToExpire: 60,
      callback: {
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        expiredUrl: input.cancelUrl
      },
      customer: input.customerId,
      externalReference: input.agencyId,
      items: [
        {
          name: `Plano ${input.planName}`,
          description: `Plano ${input.planName} do BRIFA`,
          value: Number((input.priceCents / 100).toFixed(2)),
          quantity: 1
        }
      ],
      subscription: {
        cycle: "MONTHLY",
        nextDueDate
      }
    })
  })) as Record<string, unknown>;

  if (typeof raw.id !== "string" || !raw.id) {
    throw new Error("A Asaas não retornou o identificador do checkout.");
  }

  return {
    id: raw.id,
    url: resolveCheckoutUrl(raw),
    customer: typeof raw.customer === "string" ? raw.customer : null,
    subscription: typeof raw.subscription === "string" ? raw.subscription : null,
    raw: raw as Json
  } satisfies AsaasCheckoutSession;
}

export function parseAsaasWebhookPayload(payload: AsaasWebhookPayload) {
  const checkout = payload.checkout && typeof payload.checkout === "object" ? payload.checkout : null;
  const payment = payload.payment && typeof payload.payment === "object" ? payload.payment : null;
  const subscription = payload.subscription && typeof payload.subscription === "object" ? payload.subscription : null;
  const customer = payload.customer && typeof payload.customer === "object" ? payload.customer : null;

  return {
    event: typeof payload.event === "string" ? payload.event : "",
    checkoutId: checkout && typeof checkout.id === "string" ? checkout.id : null,
    paymentId: payment && typeof payment.id === "string" ? payment.id : null,
    paymentStatus: payment && typeof payment.status === "string" ? payment.status : null,
    subscriptionId:
      (subscription && typeof subscription.id === "string" ? subscription.id : null) ||
      (payment && typeof payment.subscription === "string" ? payment.subscription : null) ||
      (checkout && typeof checkout.subscription === "string" ? checkout.subscription : null),
    customerId:
      (customer && typeof customer.id === "string" ? customer.id : null) ||
      (payment && typeof payment.customer === "string" ? payment.customer : null) ||
      (checkout && typeof checkout.customer === "string" ? checkout.customer : null),
    nextDueDate:
      (subscription && typeof subscription.nextDueDate === "string" ? subscription.nextDueDate : null) ||
      (payment && typeof payment.dueDate === "string" ? payment.dueDate : null),
    raw: payload as Json
  };
}

export function isAsaasPaymentConfirmed(event: string, paymentStatus?: string | null) {
  return (
    ["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"].includes(event) ||
    paymentStatus === "RECEIVED" ||
    paymentStatus === "CONFIRMED"
  );
}

export function isAsaasDelinquentEvent(event: string, paymentStatus?: string | null) {
  return ["PAYMENT_OVERDUE", "PAYMENT_DELETED", "SUBSCRIPTION_DELETED", "PAYMENT_REFUNDED"].includes(event) ||
    paymentStatus === "OVERDUE"
    ? true
    : false;
}

export function isFutureAsaasDueDate(value: string | null | undefined) {
  if (!value) return false;

  const today = new Date().toISOString().slice(0, 10);
  return value.slice(0, 10) > today;
}

export async function cancelAsaasSubscription(subscriptionId: string) {
  const normalizedId = subscriptionId.trim();

  if (!normalizedId) {
    throw new Error("Assinatura Asaas inválida para cancelamento.");
  }

  await asaasRequest<Record<string, unknown>>({
    path: `/subscriptions/${normalizedId}`,
    method: "DELETE"
  });
}

export function validateAsaasWebhookRequest(request: Request) {
  const expectedToken = process.env.ASAAS_WEBHOOK_AUTH_TOKEN?.trim();

  if (!expectedToken) {
    throw new Error("ASAAS_WEBHOOK_AUTH_TOKEN não configurado.");
  }

  const receivedToken = request.headers.get("asaas-access-token")?.trim();
  return receivedToken === expectedToken;
}
