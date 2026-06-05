/** Default relays for publishing this bot's kind 10050 on startup. */
export const DEFAULT_PUBLISH_DISCOVERY_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
];

/** Default relays for querying peers' kind 10050 when sending DMs. */
export const DEFAULT_QUERY_DISCOVERY_RELAYS = [
  "wss://relay.damus.io",
  "wss://purplepag.es",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

/**
 * True when `discoveryRelays` is explicitly `[]` — use only configured relays
 * for kind-10050 publish/query and outbound DM publish (no public relays).
 */
export function isConfiguredRelaysOnly(discoveryRelays: string[] | undefined): boolean {
  return discoveryRelays !== undefined && discoveryRelays.length === 0;
}

/** Extra relays to query beyond configured ones. `undefined` config → built-in defaults. */
export function queryDiscoveryRelays(discoveryRelays: string[] | undefined): string[] {
  if (discoveryRelays === undefined) {
    return DEFAULT_QUERY_DISCOVERY_RELAYS;
  }
  return discoveryRelays;
}

/** Extra relays for kind-10050 publish on startup. `undefined` config → built-in defaults. */
export function publishDiscoveryRelays(discoveryRelays: string[] | undefined): string[] {
  if (discoveryRelays === undefined) {
    return DEFAULT_PUBLISH_DISCOVERY_RELAYS;
  }
  return discoveryRelays;
}

export function mergeRelayUrls(base: string[], extra: string[]): string[] {
  const normalizeUrl = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const seen = new Set(base.map(normalizeUrl));
  const merged = [...base];
  for (const relay of extra) {
    const key = normalizeUrl(relay);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(relay);
    }
  }
  return merged;
}
