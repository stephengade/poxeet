// The only code that talks to Zoho's email API (ZeptoMail). Everything else goes through lib/email/index.ts.
// Server only: the API key must never reach the browser.

export type Address = { email: string; name?: string };

export type OutgoingEmail = {
  from: Address;
  to: Address;
  replyTo?: Address;
  subject: string;
  html: string;
  text?: string;
  /** Our own reference, echoed in Zoho's logs: a notification id, for example. */
  reference?: string;
};

export type SendResult =
  | { ok: true; id: string | null; logged?: true }
  | { ok: false; error: string; status?: number; retryable: boolean };

const DEFAULT_URL = "https://cpaas.zoho.com/v1.1/email";
const TIMEOUT_MS = 10_000;

type ZohoError = { error?: { code?: string; message?: string; details?: Array<{ message?: string; target?: string }> } };

function apiKey() {
  // The dashboard shows the key with its "Zoho-enczapikey " prefix; accept it either way.
  return process.env.ZOHO_API_KEY?.replace(/^Zoho-enczapikey\s+/i, "").trim() || null;
}

const toZoho = ({ email, name }: Address) => ({ address: email, ...(name ? { name } : {}) });

function payload(message: OutgoingEmail) {
  return {
    from: toZoho(message.from),
    to: [{ email_address: toZoho(message.to) }],
    ...(message.replyTo ? { reply_to: [toZoho(message.replyTo)] } : {}),
    subject: message.subject,
    htmlbody: message.html,
    ...(message.text ? { textbody: message.text } : {}),
    ...(message.reference ? { client_reference: message.reference } : {}),
  };
}

async function post(body: unknown, key: string): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(process.env.ZOHO_EMAIL_URL || DEFAULT_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Zoho-enczapikey ${key}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => ({}))) as ZohoError & { request_id?: string };
    if (response.ok) return { ok: true, id: json.request_id ?? null };
    const detail = json.error?.details?.map((item) => item.message).filter(Boolean).join("; ");
    return {
      ok: false,
      status: response.status,
      error: [json.error?.code, json.error?.message, detail].filter(Boolean).join(": ") || `Zoho answered ${response.status}`,
      retryable: response.status === 429 || response.status >= 500,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "Zoho did not answer within 10 seconds" : String(error), retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sends one email. Retries once after a short pause when Zoho is busy or failing. Never throws.
 * Without ZOHO_API_KEY (local development) it logs the email instead of sending it.
 */
export async function sendViaZoho(message: OutgoingEmail): Promise<SendResult> {
  if (typeof window !== "undefined") throw new Error("Email is server-only.");
  const key = apiKey();
  if (!key) {
    console.info(`[email] ZOHO_API_KEY is not set, so this email was not sent.\n  to: ${message.to.email}\n  subject: ${message.subject}\n${message.text ?? ""}`);
    return { ok: true, id: null, logged: true };
  }
  const first = await post(payload(message), key);
  if (first.ok || !first.retryable) return first;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return post(payload(message), key);
}
