export const WALKTHROUGH_MODELS = [
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'anthropic/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
  { id: 'anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-opus-4.7', label: 'Claude Opus 4.7' },
] as const;

export type WalkthroughModel = (typeof WALKTHROUGH_MODELS)[number]['id'];

export const DEFAULT_WALKTHROUGH_MODEL: WalkthroughModel = 'google/gemini-2.5-flash';

export function isWalkthroughModel(value: string): value is WalkthroughModel {
  return WALKTHROUGH_MODELS.some((model) => model.id === value);
}
