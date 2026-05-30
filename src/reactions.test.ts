import { describe, expect, it, vi } from "vitest";
import {
  createReactionFirer,
  createReplyReactionHooks,
  EVENT_EMOJI,
  isReactionEnabled,
  mergeReactionToggle,
  REACTION_KEYS,
  type ReactionToggleKey,
} from "./reactions.js";

describe("isReactionEnabled", () => {
  it("returns true for all keys when toggles are undefined", () => {
    for (const key of REACTION_KEYS) {
      expect(isReactionEnabled(undefined, key)).toBe(true);
    }
  });

  it("returns false when key is explicitly disabled", () => {
    expect(isReactionEnabled({ onReplyStart: false }, "onReplyStart")).toBe(false);
  });

  it("returns true for unset keys when another key is disabled", () => {
    expect(isReactionEnabled({ onReplyStart: false }, "receipt")).toBe(true);
  });

  it("returns true when key is explicitly enabled", () => {
    expect(isReactionEnabled({ onReplyStart: true }, "onReplyStart")).toBe(true);
  });
});

describe("mergeReactionToggle", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(mergeReactionToggle(undefined, undefined)).toBeUndefined();
  });

  it("returns base when override is undefined", () => {
    expect(mergeReactionToggle({ onReplyStart: false }, undefined)).toEqual({
      onReplyStart: false,
    });
  });

  it("deep-merges keys with override winning per key", () => {
    expect(
      mergeReactionToggle(
        { onReplyStart: false, onToolStart: false },
        { onCompactionStart: false },
      ),
    ).toEqual({
      onReplyStart: false,
      onToolStart: false,
      onCompactionStart: false,
    });
  });

  it("allows account override to re-enable a base-disabled key", () => {
    expect(mergeReactionToggle({ onReplyStart: false }, { onReplyStart: true })).toEqual({
      onReplyStart: true,
    });
  });
});

describe("createReactionFirer", () => {
  it("calls reactFn when reaction is enabled", () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const firer = createReactionFirer({ toggles: undefined, reactFn });

    firer.fireIfEnabled("receipt", "🤙");

    expect(reactFn).toHaveBeenCalledOnce();
    expect(reactFn).toHaveBeenCalledWith("🤙");
  });

  it("does not call reactFn when reaction is disabled", () => {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const firer = createReactionFirer({
      toggles: { onReplyStart: false },
      reactFn,
    });

    firer.fireIfEnabled("onReplyStart", "💭");

    expect(reactFn).not.toHaveBeenCalled();
  });

  it("swallows reactFn rejection", async () => {
    const reactFn = vi.fn().mockRejectedValue(new Error("relay down"));
    const firer = createReactionFirer({ toggles: undefined, reactFn });

    expect(() => firer.fireIfEnabled("receipt", "🤙")).not.toThrow();
    await vi.waitFor(() => expect(reactFn).toHaveBeenCalledOnce());
  });
});

describe("createReplyReactionHooks", () => {
  const pickThinking = (): string => "💭";

  function makeHooks(toggles?: Partial<Record<ReactionToggleKey, boolean>>) {
    const reactFn = vi.fn().mockResolvedValue(undefined);
    const firer = createReactionFirer({ toggles, reactFn });
    const hooks = createReplyReactionHooks(firer, pickThinking, EVENT_EMOJI);
    return { reactFn, hooks };
  }

  it("fires onReplyStart when enabled", () => {
    const { reactFn, hooks } = makeHooks();
    hooks.onReplyStart();
    expect(reactFn).toHaveBeenCalledWith("💭");
  });

  it("skips onReplyStart when disabled", () => {
    const { reactFn, hooks } = makeHooks({ onReplyStart: false });
    hooks.onReplyStart();
    expect(reactFn).not.toHaveBeenCalled();
  });

  it("fires onToolStart when enabled", () => {
    const { reactFn, hooks } = makeHooks();
    hooks.onToolStart();
    expect(reactFn).toHaveBeenCalledWith(EVENT_EMOJI.toolStart);
  });

  it("skips onToolStart when disabled", () => {
    const { reactFn, hooks } = makeHooks({ onToolStart: false });
    hooks.onToolStart();
    expect(reactFn).not.toHaveBeenCalled();
  });

  it("fires onPlanUpdate when enabled", () => {
    const { reactFn, hooks } = makeHooks();
    hooks.onPlanUpdate();
    expect(reactFn).toHaveBeenCalledWith(EVENT_EMOJI.planUpdate);
  });

  it("fires onCompactionStart when enabled", () => {
    const { reactFn, hooks } = makeHooks();
    hooks.onCompactionStart();
    expect(reactFn).toHaveBeenCalledWith(EVENT_EMOJI.compactionStart);
  });

  it("skips onCompactionStart when disabled", () => {
    const { reactFn, hooks } = makeHooks({ onCompactionStart: false });
    hooks.onCompactionStart();
    expect(reactFn).not.toHaveBeenCalled();
  });
});
