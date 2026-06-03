import { createHash, randomBytes } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import * as nip44 from "nostr-tools/nip44";
import { base64 } from "@scure/base";
import { MediaProcessingError } from "./media-handler.js";
import type { Kind14ImetaAttachment } from "./kind14-imeta-tags.js";
import {
  fetchKind14ImetaMedia,
  Kind14MediaProcessingError,
  looksLikeNip44V2Payload,
  resolveKind14MimeType,
  sniffMimeType,
  verifySha256,
} from "./kind14-imeta-media.js";

const conversationKey = nip44.v2.utils.getConversationKey(
  generateSecretKey(),
  getPublicKey(generateSecretKey()),
);

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const GIF_BYTES = Buffer.from("GIF89a", "ascii");
const WEBP_BYTES = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.alloc(4),
  Buffer.from("WEBP", "ascii"),
]);
const PDF_BYTES = Buffer.from("%PDF-1.4", "ascii");

function sha256Hex(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function mockFetchResponse(params: {
  status?: number;
  statusText?: string;
  body?: Buffer;
  contentType?: string;
}): Response {
  const status = params.status ?? 200;
  const statusText = params.statusText ?? "OK";
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? params.contentType ?? null : null,
    },
    arrayBuffer: async () =>
      (params.body ?? Buffer.alloc(0)).buffer.slice(
        params.body?.byteOffset ?? 0,
        (params.body?.byteOffset ?? 0) + (params.body?.byteLength ?? 0),
      ),
  } as Response;
}

describe("looksLikeNip44V2Payload", () => {
  it("2.1 returns true for valid NIP-44 v2 ciphertext string", () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    expect(looksLikeNip44V2Payload(Buffer.from(payload, "utf8"))).toBe(true);
  });

  it("2.2 returns false for raw JPEG", () => {
    expect(looksLikeNip44V2Payload(JPEG_BYTES)).toBe(false);
  });

  it("2.3 returns false for raw PNG", () => {
    expect(looksLikeNip44V2Payload(PNG_BYTES)).toBe(false);
  });

  it("2.4 returns false for empty buffer", () => {
    expect(looksLikeNip44V2Payload(Buffer.alloc(0))).toBe(false);
  });

  it("2.5 returns false for too-short string", () => {
    expect(looksLikeNip44V2Payload(Buffer.from("abc", "utf8"))).toBe(false);
  });

  it("2.6 returns false for invalid base64 payload", () => {
    const invalid = Buffer.from("A".repeat(200), "utf8");
    expect(looksLikeNip44V2Payload(invalid)).toBe(false);
  });

  it("2.7 returns false when decoded version byte is not 2", () => {
    const nonce = randomBytes(32);
    const ciphertext = randomBytes(64);
    const mac = randomBytes(32);
    const payload = base64.encode(
      Buffer.concat([Buffer.from([1]), nonce, ciphertext, mac]),
    );
    expect(looksLikeNip44V2Payload(Buffer.from(payload, "utf8"))).toBe(false);
  });

  it("2.8 returns true for valid payload with surrounding whitespace", () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    expect(looksLikeNip44V2Payload(Buffer.from(`\n${payload}\n`, "utf8"))).toBe(true);
  });
});

describe("sniffMimeType", () => {
  it("2.9 detects JPEG", () => {
    expect(sniffMimeType(JPEG_BYTES)).toBe("image/jpeg");
  });

  it("2.10 detects PNG", () => {
    expect(sniffMimeType(PNG_BYTES)).toBe("image/png");
  });

  it("2.11 detects GIF", () => {
    expect(sniffMimeType(GIF_BYTES)).toBe("image/gif");
  });

  it("2.12 detects WebP", () => {
    expect(sniffMimeType(WEBP_BYTES)).toBe("image/webp");
  });

  it("2.13 detects PDF", () => {
    expect(sniffMimeType(PDF_BYTES)).toBe("application/pdf");
  });

  it("2.14 returns undefined for unknown binary", () => {
    expect(sniffMimeType(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBeUndefined();
  });

  it("2.15 returns undefined for empty buffer", () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeUndefined();
  });
});

describe("verifySha256", () => {
  const data = Buffer.from("hello");

  it("2.16 matches lowercase hex", () => {
    expect(verifySha256(data, sha256Hex(data))).toBe(true);
  });

  it("2.17 matches uppercase hex", () => {
    expect(verifySha256(data, sha256Hex(data).toUpperCase())).toBe(true);
  });

  it("2.18 rejects wrong hash", () => {
    expect(verifySha256(data, "a".repeat(64))).toBe(false);
  });

  it("2.19 rejects wrong hex length", () => {
    expect(verifySha256(data, "abc123")).toBe(false);
  });
});

describe("resolveKind14MimeType", () => {
  it("2.20 prefers attachment.mimeType", () => {
    expect(
      resolveKind14MimeType(
        { url: "https://x/a", mimeType: "image/jpeg" },
        "image/png",
        PNG_BYTES,
      ),
    ).toBe("image/jpeg");
  });

  it("2.21 uses Content-Type without params when imeta m is absent", () => {
    expect(
      resolveKind14MimeType(
        { url: "https://x/a" },
        "image/png; charset=binary",
        PNG_BYTES,
      ),
    ).toBe("image/png");
  });

  it("2.22 sniffs JPEG when no imeta m or content type", () => {
    expect(resolveKind14MimeType({ url: "https://x/a" }, undefined, JPEG_BYTES)).toBe(
      "image/jpeg",
    );
  });

  it("2.23 returns undefined when nothing matches", () => {
    expect(
      resolveKind14MimeType(
        { url: "https://x/a" },
        undefined,
        Buffer.from([0x00, 0x01, 0x02]),
      ),
    ).toBeUndefined();
  });
});

describe("fetchKind14ImetaMedia raw path", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("3.1 returns raw JPEG bytes with imeta mimeType", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: JPEG_BYTES, contentType: "image/jpeg" }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://storage.example/photo.jpg", mimeType: "image/jpeg" },
      conversationKey,
    );

    expect(result.data.equals(JPEG_BYTES)).toBe(true);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("3.2 returns raw PNG with Content-Type mime", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: PNG_BYTES, contentType: "image/png" }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://storage.example/photo.png" },
      conversationKey,
    );

    expect(result.data.equals(PNG_BYTES)).toBe(true);
    expect(result.mimeType).toBe("image/png");
  });

  it("3.3 sniffs JPEG when no imeta m or Content-Type", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: JPEG_BYTES }));

    const result = await fetchKind14ImetaMedia(
      { url: "https://storage.example/photo.jpg" },
      conversationKey,
    );

    expect(result.mimeType).toBe("image/jpeg");
  });

  it("3.4 throws fetch error on HTTP 404", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ status: 404, statusText: "Not Found" }),
    );

    await expect(
      fetchKind14ImetaMedia({ url: "https://storage.example/missing.jpg" }, conversationKey),
    ).rejects.toMatchObject({
      name: "MediaProcessingError",
      stage: "fetch",
      message: "Failed to fetch blob: 404 Not Found",
    });
  });

  it("3.5 throws fetch error on HTTP 500", async () => {
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ status: 500, statusText: "Internal Server Error" }),
    );

    await expect(
      fetchKind14ImetaMedia({ url: "https://storage.example/error.jpg" }, conversationKey),
    ).rejects.toMatchObject({ stage: "fetch" });
  });

  it("3.6 throws fetch error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network down"));

    await expect(
      fetchKind14ImetaMedia({ url: "https://storage.example/photo.jpg" }, conversationKey),
    ).rejects.toMatchObject({
      name: "MediaProcessingError",
      stage: "fetch",
      message: "network down",
    });
  });

  it("3.7 accepts empty response body", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: Buffer.alloc(0) }));

    const result = await fetchKind14ImetaMedia(
      { url: "https://storage.example/empty.bin" },
      conversationKey,
    );

    expect(result.data.equals(Buffer.alloc(0))).toBe(true);
  });

  it("3.8 does not mutate raw bytes (no decrypt path)", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: JPEG_BYTES }));

    const result = await fetchKind14ImetaMedia(
      { url: "https://storage.example/photo.jpg", mimeType: "image/jpeg" },
      conversationKey,
    );

    expect(result.data).toEqual(JPEG_BYTES);
  });
});

describe("fetchKind14ImetaMedia NIP-44 path", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("4.1 decrypts NIP-44 text payload round-trip", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://blossom.example/encrypted" },
      conversationKey,
    );

    expect(result.data.equals(Buffer.from("hello", "utf8"))).toBe(true);
  });

  it("4.2 decrypts UTF-8 nip44 payload string without double-base64", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://blossom.example/encrypted" },
      conversationKey,
    );

    expect(result.data.toString("utf8")).toBe("hello");
  });

  it("4.3 decodes base64 inner payload for non-text MIME", async () => {
    const innerBase64 = PNG_BYTES.toString("base64");
    const payload = nip44.v2.encrypt(innerBase64, conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://blossom.example/encrypted.png", mimeType: "image/png" },
      conversationKey,
    );

    expect(result.data.equals(PNG_BYTES)).toBe(true);
    expect(result.mimeType).toBe("image/png");
  });

  it("4.4 throws decrypt error with wrong conversation key", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const otherSk = generateSecretKey();
    const wrongKey = nip44.v2.utils.getConversationKey(otherSk, getPublicKey(generateSecretKey()));

    await expect(
      fetchKind14ImetaMedia({ url: "https://blossom.example/encrypted" }, wrongKey),
    ).rejects.toMatchObject({
      name: "MediaProcessingError",
      stage: "decrypt",
    });
  });

  it("4.5 throws decrypt error for corrupt nip44-shaped payload", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    const corrupted = `${payload.slice(0, -4)}AAAA`;
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(corrupted, "utf8") }),
    );

    await expect(
      fetchKind14ImetaMedia({ url: "https://blossom.example/encrypted" }, conversationKey),
    ).rejects.toMatchObject({ stage: "decrypt" });
  });

  it("4.6 throws decrypt error for truncated ciphertext", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    const decoded = Buffer.from(base64.decode(payload));
    decoded[50] ^= 0xff;
    const damagedPayload = base64.encode(decoded);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(damagedPayload, "utf8") }),
    );

    await expect(
      fetchKind14ImetaMedia({ url: "https://blossom.example/encrypted" }, conversationKey),
    ).rejects.toMatchObject({ stage: "decrypt" });
  });

  it("4.7 prefers NIP-44 decrypt over raw sniff path", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const result = await fetchKind14ImetaMedia(
      { url: "https://blossom.example/encrypted" },
      conversationKey,
    );

    expect(result.data.toString("utf8")).toBe("hello");
    expect(looksLikeNip44V2Payload(Buffer.from(payload, "utf8"))).toBe(true);
  });
});

describe("fetchKind14ImetaMedia sha256 verify", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("5.1 succeeds when raw JPEG matches x hash", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: JPEG_BYTES }));

    const result = await fetchKind14ImetaMedia(
      {
        url: "https://storage.example/photo.jpg",
        mimeType: "image/jpeg",
        sha256: sha256Hex(JPEG_BYTES),
      },
      conversationKey,
    );

    expect(result.data.equals(JPEG_BYTES)).toBe(true);
  });

  it("5.2 throws verify error when x hash mismatches", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: JPEG_BYTES }));

    await expect(
      fetchKind14ImetaMedia(
        {
          url: "https://storage.example/photo.jpg",
          mimeType: "image/jpeg",
          sha256: "a".repeat(64),
        },
        conversationKey,
      ),
    ).rejects.toMatchObject({
      name: "Kind14MediaProcessingError",
      stage: "verify",
      message: "SHA-256 mismatch",
    });
  });

  it("5.3 verifies hash of final bytes after NIP-44 decrypt", async () => {
    const payload = nip44.v2.encrypt("hello", conversationKey);
    vi.mocked(fetch).mockResolvedValue(
      mockFetchResponse({ body: Buffer.from(payload, "utf8") }),
    );

    const decrypted = Buffer.from("hello", "utf8");
    const result = await fetchKind14ImetaMedia(
      {
        url: "https://blossom.example/encrypted",
        sha256: sha256Hex(decrypted),
      },
      conversationKey,
    );

    expect(result.data.equals(decrypted)).toBe(true);
  });

  it("5.4 skips verify when x is absent", async () => {
    vi.mocked(fetch).mockResolvedValue(mockFetchResponse({ body: JPEG_BYTES }));

    await expect(
      fetchKind14ImetaMedia(
        { url: "https://storage.example/photo.jpg", mimeType: "image/jpeg" },
        conversationKey,
      ),
    ).resolves.toBeDefined();
  });
});

describe("Kind14MediaProcessingError", () => {
  it("is distinguishable from MediaProcessingError", () => {
    expect(new Kind14MediaProcessingError("SHA-256 mismatch", "verify")).toBeInstanceOf(Error);
    expect(new MediaProcessingError("fetch failed", "fetch")).not.toBeInstanceOf(
      Kind14MediaProcessingError,
    );
  });
});
