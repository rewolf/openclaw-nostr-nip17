import { describe, expect, it } from "vitest";
import {
  assertPublishSucceeded,
  type PublishAttemptResult,
} from "./publish-results.js";

function result(
  kind: "recipient" | "self",
  relay: string,
  status: "fulfilled" | "rejected",
  reason?: string,
): PublishAttemptResult {
  return {
    kind,
    relay,
    result:
      status === "fulfilled"
        ? { status: "fulfilled", value: undefined }
        : { status: "rejected", reason: reason ?? new Error("publish failed") },
  };
}

describe("assertPublishSucceeded", () => {
  it("throws when all recipient publishes fail", () => {
    const results = [
      result("recipient", "wss://a", "rejected"),
      result("recipient", "wss://b", "rejected"),
    ];
    expect(() => assertPublishSucceeded(results)).toThrow(/failed on all relays/i);
  });

  it("throws when some recipient publishes fail (partial success)", () => {
    const results = [
      result("recipient", "wss://a", "fulfilled"),
      result("recipient", "wss://b", "rejected"),
    ];
    expect(() => assertPublishSucceeded(results)).toThrow(/partial/i);
  });

  it("throws when all recipient succeed but self publish fails", () => {
    const results = [
      result("recipient", "wss://a", "fulfilled"),
      result("self", "wss://a", "rejected"),
    ];
    expect(() => assertPublishSucceeded(results)).toThrow(/partial/i);
  });

  it("does not throw when all recipient and self publishes succeed", () => {
    const results = [
      result("recipient", "wss://a", "fulfilled"),
      result("recipient", "wss://b", "fulfilled"),
      result("self", "wss://a", "fulfilled"),
    ];
    expect(() => assertPublishSucceeded(results)).not.toThrow();
  });

  it("throws when no recipient publish attempts exist", () => {
    expect(() => assertPublishSucceeded([])).toThrow(/no recipient/i);
  });
});
