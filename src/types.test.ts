import { describe, expect, it } from "vitest";
import { resolveNip17Account } from "./types.js";

// Valid 32-byte hex private key (test vector pubkey from nip17-bus.test.ts)
const TEST_PRIVATE_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function makeCfg(overrides: Record<string, unknown> = {}) {
  return {
    channels: {
      "nostr-nip17": {
        privateKey: TEST_PRIVATE_KEY,
        ...overrides,
      },
    },
  };
}

describe("resolveNip17Account reactionToggle", () => {
  it("passes through top-level reactionToggle", () => {
    const account = resolveNip17Account({
      cfg: makeCfg({
        reactionToggle: {
          onReplyStart: false,
          onToolStart: false,
        },
      }),
    });

    expect(account.config.reactionToggle).toEqual({
      onReplyStart: false,
      onToolStart: false,
    });
  });

  it("deep-merges account reactionToggle with base", () => {
    const account = resolveNip17Account({
      cfg: makeCfg({
        reactionToggle: {
          onReplyStart: false,
          onToolStart: false,
        },
        accounts: {
          "second-agent": {
            privateKey: TEST_PRIVATE_KEY,
            reactionToggle: {
              onCompactionStart: false,
            },
          },
        },
      }),
      accountId: "second-agent",
    });

    expect(account.config.reactionToggle).toEqual({
      onReplyStart: false,
      onToolStart: false,
      onCompactionStart: false,
    });
  });

  it("allows account override to re-enable a base-disabled key", () => {
    const account = resolveNip17Account({
      cfg: makeCfg({
        reactionToggle: {
          onReplyStart: false,
        },
        accounts: {
          "second-agent": {
            privateKey: TEST_PRIVATE_KEY,
            reactionToggle: {
              onReplyStart: true,
            },
          },
        },
      }),
      accountId: "second-agent",
    });

    expect(account.config.reactionToggle?.onReplyStart).toBe(true);
  });
});
