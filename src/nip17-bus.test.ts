import { describe, expect, it } from "vitest";
import {
  isValidPubkey,
  normalizePubkey,
  pubkeyToNpub,
} from "./nip17-bus.js";

// Nostr test vector (hex pubkey)
const HEX_PUBKEY = "7b484f7b96960deffc0a42961cf1de90a43268d67accce9ec50a04e6b0092593";

describe("normalizePubkey", () => {
  it("accepts 64-char hex and lowercases", () => {
    const upper = HEX_PUBKEY.toUpperCase();
    expect(normalizePubkey(upper)).toBe(HEX_PUBKEY);
  });

  it("rejects invalid hex length", () => {
    expect(() => normalizePubkey("abc")).toThrow(/64 hex/);
  });
});

describe("isValidPubkey", () => {
  it("returns true for hex and npub", () => {
    expect(isValidPubkey(HEX_PUBKEY)).toBe(true);
    const npub = pubkeyToNpub(HEX_PUBKEY);
    expect(npub.startsWith("npub1")).toBe(true);
    expect(isValidPubkey(npub)).toBe(true);
  });

  it("returns false for garbage", () => {
    expect(isValidPubkey("not-a-key")).toBe(false);
    expect(isValidPubkey("")).toBe(false);
  });
});
