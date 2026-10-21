// The AI providers Poxeet can use. Safe for the browser: names, key hints and links only, no SDKs or secrets.
// Adding a provider: add it here, to the check on user_api_keys.provider, and to lib/ai/server.ts.

export const PROVIDER_IDS = ["anthropic", "openai", "deepseek"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderInfo = {
  id: ProviderId;
  /** What members see. */
  label: string;
  vendor: string;
  /** How keys usually start, for the field's placeholder and a gentle format check. */
  keyPrefix: string;
  keysUrl: string;
  /** Where member content goes, for the privacy note on the AI access screen. */
  dataNote: string;
};

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: "anthropic", label: "Claude", vendor: "Anthropic", keyPrefix: "sk-ant-",
    keysUrl: "https://console.anthropic.com/settings/keys",
    dataNote: "Your imported posts and brief are sent to Anthropic to analyse your voice and write drafts.",
  },
  openai: {
    id: "openai", label: "OpenAI", vendor: "OpenAI", keyPrefix: "sk-",
    keysUrl: "https://platform.openai.com/api-keys",
    dataNote: "Your imported posts and brief are sent to OpenAI to analyse your voice and write drafts.",
  },
  deepseek: {
    id: "deepseek", label: "DeepSeek", vendor: "DeepSeek", keyPrefix: "sk-",
    keysUrl: "https://platform.deepseek.com/api_keys",
    dataNote: "Your imported posts and brief are sent to DeepSeek, to analyse your voice and write drafts.",
  },
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}
