import { describe, expect, it } from "vitest";
import {
  isConfiguredRelaysOnly,
  mergeRelayUrls,
  publishDiscoveryRelays,
  queryDiscoveryRelays,
} from "./discovery-relays.js";

describe("discovery relay config", () => {
  it("treats explicit empty array as configured-relays-only mode", () => {
    expect(isConfiguredRelaysOnly([])).toBe(true);
    expect(isConfiguredRelaysOnly(undefined)).toBe(false);
    expect(isConfiguredRelaysOnly(["wss://relay.example"])).toBe(false);
  });

  it("uses defaults when discoveryRelays is omitted", () => {
    expect(queryDiscoveryRelays(undefined).length).toBeGreaterThan(0);
    expect(publishDiscoveryRelays(undefined).length).toBeGreaterThan(0);
  });

  it("uses only configured extras when discoveryRelays is set", () => {
    expect(queryDiscoveryRelays([])).toEqual([]);
    expect(publishDiscoveryRelays(["wss://relay.example"])).toEqual(["wss://relay.example"]);
  });

  it("mergeRelayUrls deduplicates by normalized URL", () => {
    expect(
      mergeRelayUrls(["wss://a.example/"], ["wss://a.example", "wss://b.example"]),
    ).toEqual(["wss://a.example/", "wss://b.example"]);
  });
});
