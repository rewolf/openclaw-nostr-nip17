import { describe, expect, it } from "vitest";
import { Nip17ConfigSchema } from "./config-schema.js";

describe("Nip17ConfigSchema reactionToggle", () => {
  it("accepts config without reactionToggle", () => {
    const result = Nip17ConfigSchema.safeParse({
      privateKey: "nsec1test",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid reactionToggle with boolean fields", () => {
    const result = Nip17ConfigSchema.safeParse({
      privateKey: "nsec1test",
      reactionToggle: {
        receipt: true,
        onReplyStart: false,
        onToolStart: false,
        onPlanUpdate: false,
        onCompactionStart: true,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reactionToggle?.onReplyStart).toBe(false);
    }
  });

  it("rejects non-boolean reactionToggle values", () => {
    const result = Nip17ConfigSchema.safeParse({
      privateKey: "nsec1test",
      reactionToggle: {
        onReplyStart: "no",
      },
    });
    expect(result.success).toBe(false);
  });
});
