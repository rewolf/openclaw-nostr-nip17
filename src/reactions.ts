export const REACTION_KEYS = [
  "receipt",
  "onReplyStart",
  "onToolStart",
  "onPlanUpdate",
  "onCompactionStart",
] as const;

export type ReactionToggleKey = (typeof REACTION_KEYS)[number];
export type ReactionToggle = Partial<Record<ReactionToggleKey, boolean>>;

export const RECEIPT_EMOJI = "🤙";

export const THINKING_EMOJIS = ["💭", "🧠", "🤔", "💡", "⏳"];

export const pickThinking = (): string =>
  THINKING_EMOJIS[Math.floor(Math.random() * THINKING_EMOJIS.length)];

export const EVENT_EMOJI = {
  toolStart: "🔧",
  planUpdate: "📋",
  compactionStart: "🗜️",
} as const;

export function isReactionEnabled(
  toggles: ReactionToggle | undefined,
  key: ReactionToggleKey,
): boolean {
  if (toggles?.[key] === false) return false;
  return true;
}

export function mergeReactionToggle(
  base?: ReactionToggle,
  override?: ReactionToggle,
): ReactionToggle | undefined {
  if (!base && !override) return undefined;
  return { ...base, ...override };
}

export interface ReactionFirer {
  fireIfEnabled(key: ReactionToggleKey, emoji: string): void;
}

export function createReactionFirer(opts: {
  toggles?: ReactionToggle;
  reactFn: (emoji: string) => Promise<void>;
}): ReactionFirer {
  const { toggles, reactFn } = opts;

  return {
    fireIfEnabled(key: ReactionToggleKey, emoji: string): void {
      if (!isReactionEnabled(toggles, key)) return;
      void reactFn(emoji).catch(() => {});
    },
  };
}

export function createReplyReactionHooks(
  firer: ReactionFirer,
  pickThinkingFn: () => string,
  eventEmoji: typeof EVENT_EMOJI,
): {
  onReplyStart: () => void;
  onToolStart: () => void;
  onPlanUpdate: () => void;
  onCompactionStart: () => void;
} {
  return {
    onReplyStart: () => firer.fireIfEnabled("onReplyStart", pickThinkingFn()),
    onToolStart: () => firer.fireIfEnabled("onToolStart", eventEmoji.toolStart),
    onPlanUpdate: () => firer.fireIfEnabled("onPlanUpdate", eventEmoji.planUpdate),
    onCompactionStart: () =>
      firer.fireIfEnabled("onCompactionStart", eventEmoji.compactionStart),
  };
}
