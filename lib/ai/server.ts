import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { billingEnabled } from "../billing/config";
import { warnIfLowBalance } from "../billing/credits";
import { jobCost, type TokenUsage } from "../billing/rates";
import type { RpcClient } from "../billing/webhook";
import { fromBytea, unseal } from "../crypto";
import { createAdminClient, getSecretKey } from "../supabase/admin";
import { isProviderId, PROVIDERS, type ProviderId } from "./providers";

// Server-only AI access: checking a key, and deciding which key a member's AI work runs on.
// Each provider is reached through its own official SDK. DeepSeek's API is OpenAI-compatible, so it uses the
// OpenAI SDK with DeepSeek's base URL.

const TIMEOUT_MS = 15_000;
/** Generation reads many posts and may think first, so it gets far longer than a key check. */
const GENERATE_TIMEOUT_MS = 180_000;
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

type ClientOptions = { fetch?: typeof fetch; timeout?: number };

function anthropicClient(apiKey: string, options: ClientOptions = {}) {
  return new Anthropic({ apiKey, timeout: options.timeout ?? TIMEOUT_MS, maxRetries: 0, ...(options.fetch ? { fetch: options.fetch } : {}) });
}

function openAiClient(provider: "openai" | "deepseek", apiKey: string, options: ClientOptions = {}) {
  return new OpenAI({
    apiKey,
    timeout: options.timeout ?? TIMEOUT_MS,
    maxRetries: 0,
    ...(provider === "deepseek" ? { baseURL: DEEPSEEK_BASE_URL } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
}

/** The model each provider's drafting and analysis runs on. Overridable per instance. */
export function modelFor(provider: ProviderId) {
  if (provider === "anthropic") return process.env.MODEL_ANTHROPIC || "claude-opus-5-5";
  if (provider === "deepseek") return process.env.MODEL_DEEPSEEK || "deepseek-flash";
  return process.env.MODEL_OPENAI || null;
}

export type KeyCheck =
  | { ok: true }
  | { ok: false; reason: "invalid" | "no_access" | "rate_limited" | "unreachable" | "error"; message: string };

/**
 * Checks a key by listing the provider's models: it proves the key works and costs no tokens.
 * A key that is rate-limited right now still counts as valid.
 */
export async function checkKey(provider: ProviderId, apiKey: string, options: ClientOptions = {}): Promise<KeyCheck> {
  const name = PROVIDERS[provider].label;
  try {
    if (provider === "anthropic") await anthropicClient(apiKey, options).models.list({ limit: 1 });
    else await openAiClient(provider, apiKey, options).models.list();
    return { ok: true };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof OpenAI.AuthenticationError) {
      return { ok: false, reason: "invalid", message: `${name} didn't accept that key. Check you copied all of it.` };
    }
    if (error instanceof Anthropic.PermissionDeniedError || error instanceof OpenAI.PermissionDeniedError) {
      return { ok: false, reason: "no_access", message: `That ${name} key doesn't have API access. Check its permissions or billing.` };
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) return { ok: true };
    if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
      return { ok: false, reason: "unreachable", message: `We couldn't reach ${name}. Try again in a minute.` };
    }
    return { ok: false, reason: "error", message: `${name} returned an error while checking the key. Try again in a minute.` };
  }
}

export type GenerateRequest = {
  system: string;
  prompt: string;
  /** The most the model may write (thinking included, where the model thinks). */
  maxOutputTokens: number;
  /** Ask for a single JSON object back. */
  json?: boolean;
};

export type Generated = { text: string; usage: TokenUsage; stop: "done" | "max_tokens" | "refused" };

/** A provider call that failed: what to tell the member, and whether trying later may work. */
export class AiProviderError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

/** Claude 5-generation models take output_config.effort; older ones (via MODEL_ANTHROPIC) may not. */
const takesEffort = (model: string) => /^claude-(opus|sonnet|haiku|fable)-5/.test(model);

/**
 * One generation call on the member's resolved access, through that provider's official SDK. Returns the text
 * and the token usage the provider reported, which runAiJob settles credits from. Throws AiProviderError with a
 * message fit to show the member.
 */
export async function generateText(access: Pick<AiAccess, "provider" | "apiKey" | "model">, request: GenerateRequest, options: ClientOptions = {}): Promise<Generated> {
  const name = PROVIDERS[access.provider].label;
  if (!access.model) throw new AiProviderError(`No ${name} model is set on this instance. Ask the operator to set MODEL_OPENAI.`, false);
  const clientOptions = { ...options, timeout: options.timeout ?? GENERATE_TIMEOUT_MS };
  try {
    if (access.provider === "anthropic") {
      const response = await anthropicClient(access.apiKey, clientOptions).messages.create({
        model: access.model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        ...(takesEffort(access.model) ? { output_config: { effort: "medium" as const } } : {}),
      });
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      return {
        text,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        stop: response.stop_reason === "refusal" ? "refused" : response.stop_reason === "max_tokens" ? "max_tokens" : "done",
      };
    }
    const response = await openAiClient(access.provider, access.apiKey, clientOptions).chat.completions.create({
      model: access.model,
      messages: [{ role: "system", content: request.system }, { role: "user", content: request.prompt }],
      // DeepSeek takes max_tokens; OpenAI's current models take max_completion_tokens.
      ...(access.provider === "deepseek" ? { max_tokens: request.maxOutputTokens } : { max_completion_tokens: request.maxOutputTokens }),
      ...(request.json ? { response_format: { type: "json_object" as const } } : {}),
    });
    const choice = response.choices[0];
    return {
      text: choice?.message?.content ?? "",
      usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
      stop: choice?.finish_reason === "length" ? "max_tokens" : choice?.finish_reason === "content_filter" ? "refused" : "done",
    };
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Anthropic.AuthenticationError || error instanceof OpenAI.AuthenticationError) {
      throw new AiProviderError(`${name} didn't accept the API key. Check it in Settings → AI access.`, false);
    }
    if (error instanceof Anthropic.PermissionDeniedError || error instanceof OpenAI.PermissionDeniedError) {
      throw new AiProviderError(`The ${name} key doesn't have access to ${access.model}. Check its permissions or billing.`, false);
    }
    if (error instanceof Anthropic.RateLimitError || error instanceof OpenAI.RateLimitError) {
      throw new AiProviderError(`${name} is rate-limiting requests right now. Try again in a few minutes.`, true);
    }
    if (error instanceof Anthropic.BadRequestError || error instanceof OpenAI.BadRequestError) {
      console.error(`[ai] ${name} refused the request:`, error.message);
      throw new AiProviderError(`${name} couldn't process the request. Try again; if it keeps happening, tell the operator.`, false);
    }
    if (error instanceof Anthropic.APIConnectionError || error instanceof OpenAI.APIConnectionError) {
      throw new AiProviderError(`We couldn't reach ${name}. Try again in a minute.`, true);
    }
    console.error(`[ai] ${name} call failed:`, error);
    throw new AiProviderError(`${name} returned an error. Try again in a minute.`, true);
  }
}

export type AiAccess = {
  provider: ProviderId;
  apiKey: string;
  model: string | null;
  /** own_key: the member's key. instance_key: the operator's key by admin grant. credits: the operator's key, paid with credits. */
  source: "own_key" | "instance_key" | "credits";
  /** For a credits job: the hold's reference and the credits held. */
  jobId: string | null;
  held: number;
};

/** One AI job, and the most tokens it may use: a credits job holds its maximum cost before the call (BILL-5). */
export type AiJob = { job: string; maxInputTokens: number; maxOutputTokens: number; jobId?: string };

export type AiAccessResult =
  | { ok: true; access: AiAccess }
  | { ok: false; reason: "not_configured" | "no_access" | "no_credits" | "cap_reached"; message: string };

type SharedKey = Pick<AiAccess, "provider" | "apiKey" | "model">;

/** The UTC day the instance-key cap counts in: from its midnight to the next. */
export function capWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { start, resets: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** What a member on the instance key is told once today's calls reach their daily_generation_cap (PRD KEY-3). */
export function capReachedMessage(cap: number, resets: Date) {
  const time = resets.toLocaleString("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", day: "numeric", month: "long" });
  return `You've used today's ${cap} AI calls on the shared key. It resets at ${time} UTC, or add your own AI key in Settings to keep going.`;
}

/** The operator's shared key, if configured: AI_PROVIDER plus that provider's key variable. */
function instanceKey(): SharedKey | null {
  const provider = process.env.AI_PROVIDER || "anthropic";
  if (!isProviderId(provider)) return null;
  const apiKey = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY, deepseek: process.env.DEEPSEEK_API_KEY }[provider];
  return apiKey ? { provider, apiKey, model: modelFor(provider) } : null;
}

/**
 * Which key a member's AI work runs on (PRD KEY-2, section 8 key resolution), called before every job: their
 * own key first; else the instance key if the operator granted them access, up to their daily_generation_cap
 * calls a UTC day; else, when billing is on, the instance key paid with credits. Own-key and credits work isn't
 * capped: the member pays for it. Given a job, a credits answer has already held the job's maximum cost, and
 * the caller must close it with finishAiJob, success or not (runAiJob does both). Without a job it only says
 * whether the member has access right now.
 */
export async function resolveAiAccess(userId: string, job?: AiJob, db?: RpcClient): Promise<AiAccessResult> {
  if (!getSecretKey()) return { ok: false, reason: "not_configured", message: "AI isn't set up on this instance yet." };
  const admin = createAdminClient();
  const [{ data: own }, { data: profile }] = await Promise.all([
    admin.from("user_api_keys").select("provider, ciphertext, iv, tag").eq("user_id", userId).maybeSingle(),
    admin.from("profiles").select("master_key_access, daily_generation_cap, account_status").eq("id", userId).maybeSingle(),
  ]);
  // A suspended account runs no AI, on any key: a plan already running stops at its next call.
  if (profile?.account_status === "suspended") return { ok: false, reason: "no_access", message: "This account is suspended. Contact the operator of this instance." };
  if (own && isProviderId(own.provider)) {
    const apiKey = unseal({ ciphertext: fromBytea(own.ciphertext), iv: fromBytea(own.iv), tag: fromBytea(own.tag) });
    return { ok: true, access: { provider: own.provider, apiKey, model: modelFor(own.provider), source: "own_key", jobId: null, held: 0 } };
  }
  const shared = instanceKey();
  if (shared && profile?.master_key_access === "granted") {
    // Every attempt writes a generation_usage row when it ends, so calls running at the same moment can each
    // pass this check: the cap may be overshot by the few calls in flight, never by a loop.
    const { start, resets } = capWindow();
    const { count, error } = await admin.from("generation_usage").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("used_master_key", true).gte("created_at", start.toISOString());
    if (error) throw new Error(`Couldn't read today's usage: ${error.message}`);
    const cap = profile.daily_generation_cap;
    if ((count ?? 0) >= cap) return { ok: false, reason: "cap_reached", message: capReachedMessage(cap, resets) };
    return { ok: true, access: { ...shared, source: "instance_key", jobId: null, held: 0 } };
  }
  if (shared && billingEnabled()) return holdForJob(db ?? (admin as unknown as RpcClient), userId, shared, job);
  return { ok: false, reason: "no_access", message: "Add your own AI key in Settings to continue." };
}

const NO_CREDITS = "You're out of credits. Buy credits or add your own AI key in Settings.";

/** The credits step of key resolution: hold the job's maximum cost, or say the balance doesn't cover it. */
export async function holdForJob(db: RpcClient, userId: string, shared: SharedKey, job?: AiJob): Promise<AiAccessResult> {
  if (!job) {
    const { data, error } = await db.rpc("current_credits", { p_user: userId });
    if (error) throw new Error(`Couldn't read the balance: ${error.message}`);
    return Number(data) > 0
      ? { ok: true, access: { ...shared, source: "credits", jobId: null, held: 0 } }
      : { ok: false, reason: "no_credits", message: NO_CREDITS };
  }
  const jobId = job.jobId ?? `${job.job}:${randomUUID()}`;
  const held = Math.max(1, jobCost({ inputTokens: job.maxInputTokens, outputTokens: job.maxOutputTokens }));
  const { data, error } = await db.rpc("reserve_credits", { p_user: userId, p_amount: held, p_job_id: jobId });
  if (error) throw new Error(`Couldn't hold credits: ${error.message}`);
  if (data !== true) return { ok: false, reason: "no_credits", message: NO_CREDITS };
  return { ok: true, access: { ...shared, source: "credits", jobId, held } };
}

/** The database calls closing a job needs. The admin Supabase client fits; tests pass a fake. */
export type AiJobDb = RpcClient & {
  from(table: "generation_usage"): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string; code?: string } | null }> };
};

/**
 * Closes a job: for a credits job, settles the hold at the actual cost (never more than was held) and releases
 * the rest, then records the tokens in generation_usage. A job with no usage (it failed before the provider
 * answered) releases its hold in full. Settling twice charges once. Returns the credits charged.
 */
export async function finishAiJob(db: AiJobDb, userId: string, job: AiJob, access: AiAccess, usage: TokenUsage | null): Promise<number> {
  let charged = 0;
  if (access.source === "credits" && access.jobId) {
    const cost = usage ? jobCost(usage) : 0;
    const { data, error } = await db.rpc("settle_credits", { p_job_id: access.jobId, p_actual: cost });
    if (error) throw new Error(`Couldn't settle credits: ${error.message}`);
    charged = Number(data ?? 0);
  }
  if (usage) {
    const { error } = await db.from("generation_usage").insert({
      user_id: userId, job: job.job, job_id: access.jobId, provider: access.provider, model: access.model ?? "unknown",
      input_tokens: usage.inputTokens, output_tokens: usage.outputTokens,
      used_master_key: access.source !== "own_key", credits_charged: charged,
    });
    // 23505: this job was already recorded.
    if (error && error.code !== "23505") console.error("[ai] Couldn't record usage:", error.message);
  }
  return charged;
}

/** Thrown by a job's work to report the tokens it used before failing, so they're still recorded and charged. */
export class AiJobError extends Error {
  constructor(message: string, readonly usage: TokenUsage) {
    super(message);
  }
}

/**
 * Runs one AI job through key resolution: resolves access (holding credits when they pay), runs `work` with
 * that access, then settles. `work` returns its result and the usage the provider reported. On failure the hold
 * is released (or the usage an AiJobError reports is charged) and the error is rethrown.
 */
export async function runAiJob<T>(
  userId: string,
  job: AiJob,
  work: (access: AiAccess) => Promise<{ value: T; usage: TokenUsage }>,
  options: { db?: AiJobDb; resolve?: typeof resolveAiAccess } = {},
): Promise<{ ok: true; value: T; charged: number } | Extract<AiAccessResult, { ok: false }>> {
  const db = options.db ?? (createAdminClient() as unknown as AiJobDb);
  const resolved = await (options.resolve ?? resolveAiAccess)(userId, job, db);
  if (!resolved.ok) return resolved;
  const { access } = resolved;
  let outcome: { value: T; usage: TokenUsage };
  try {
    outcome = await work(access);
  } catch (error) {
    await finishAiJob(db, userId, job, access, error instanceof AiJobError ? error.usage : null);
    throw error;
  }
  const charged = await finishAiJob(db, userId, job, access, outcome.usage);
  if (access.source === "credits") {
    const { data } = await db.rpc("current_credits", { p_user: userId });
    await warnIfLowBalance(userId, Number(data ?? 0));
  }
  return { ok: true, value: outcome.value, charged };
}

/** For the AI access screen: which provider the instance key uses, if there is one. */
export function instanceProvider(): ProviderId | null {
  return instanceKey()?.provider ?? null;
}

/** The model credits pay for: the instance key's. Null when no instance key is configured. */
export function creditsModel(): string | null {
  return instanceKey()?.model ?? null;
}

/** Whether members can pay for AI with credits here: billing on and an instance key to spend them on. */
export function creditsAvailable() {
  return billingEnabled() && instanceKey() !== null;
}
