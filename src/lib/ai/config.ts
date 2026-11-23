import 'server-only';

/** Server-side AI configuration. The API key never leaves the server. */
export const DEFAULT_MODEL = 'claude-opus-5-5';

export function aiModel(): string {
  return process.env.CADENCE_AI_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function anonymousAiAllowed(): boolean {
  return process.env.CADENCE_AI_ALLOW_ANONYMOUS === 'true';
}
