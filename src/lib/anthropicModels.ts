/**
 * Anthropic models we offer as one-tap picks for an Anthropic key (Admin → API keys, and Account → own keys).
 * Prices are $ per million tokens from platform.claude.com/docs/about-claude/pricing (checked 20 Nov 2026);
 * they fill the "AI usage and cost" price boxes when a model is added. Every pick is still tested before save.
 */
export const ANTHROPIC_MODELS: { id: string; label: string; in: number; out: number; note: string }[] = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5", in: 0.1, out: 0.5, note: "fastest, cheapest" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", in: 2, out: 10, note: "best value for writing" },
  { id: "claude-opus-5-5", label: "Opus 5.5", in: 4, out: 20, note: "stronger, 2× Sonnet" },
  { id: "claude-fable-5-2", label: "Fable 5.2", in: 8, out: 40, note: "most capable, most expensive" },
];

export const isAnthropic = (base: string) => /anthropic\.com/i.test(base || "");
export const anthropicPrice = (model: string) => ANTHROPIC_MODELS.find((m) => m.id === model.trim());
