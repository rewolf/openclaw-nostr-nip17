import { describe, expect, it, vi } from "vitest";
import { MediaProcessingError } from "./media-handler.js";
import { Kind14MediaProcessingError } from "./kind14-imeta-media.js";
import type { Kind14ImetaAttachment } from "./kind14-imeta-tags.js";
import { processKind14ImetaAttachments, processKind15FileAttachment } from "./inbound-media-processing.js";

const attachmentA: Kind14ImetaAttachment = {
  url: "https://blossom.example/a",
  mimeType: "image/jpeg",
};

const attachmentB: Kind14ImetaAttachment = {
  url: "https://blossom.example/b",
  mimeType: "application/pdf",
};

describe("processKind14ImetaAttachments", () => {
  it("returns empty results for empty attachments", async () => {
    const result = await processKind14ImetaAttachments({
      attachments: [],
      fetchKind14Media: vi.fn(),
      deriveKey: () => new Uint8Array(32),
    });

    expect(result).toEqual({ succeeded: [], failed: [] });
  });

  it("returns succeeded media when all attachments fetch", async () => {
    const fetchKind14Media = vi.fn(async (attachment: Kind14ImetaAttachment) => ({
      data: Buffer.from(`data-${attachment.url}`),
      mimeType: "image/jpeg",
    }));

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA, attachmentB],
      fetchKind14Media,
      deriveKey: () => new Uint8Array(32),
    });

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(2);
    expect(result.succeeded[0]?.originalUrl).toBe(attachmentA.url);
    expect(result.succeeded[1]?.originalUrl).toBe(attachmentB.url);
    expect(fetchKind14Media).toHaveBeenCalledWith(attachmentA, expect.any(Uint8Array));
    expect(fetchKind14Media).toHaveBeenCalledWith(attachmentB, expect.any(Uint8Array));
  });

  it("passes full attachment including sha256 to fetchKind14Media", async () => {
    const attachmentWithHash: Kind14ImetaAttachment = {
      ...attachmentA,
      sha256: "abc",
      blurhash: "LxGF5",
      dimensions: { width: 100, height: 200 },
    };
    const fetchKind14Media = vi.fn(async () => ({
      data: Buffer.from("ok"),
      mimeType: "image/jpeg",
    }));

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentWithHash],
      fetchKind14Media,
      deriveKey: () => new Uint8Array(32),
    });

    expect(fetchKind14Media).toHaveBeenCalledWith(attachmentWithHash, expect.any(Uint8Array));
    expect(result.succeeded[0]).toMatchObject({
      blurhash: "LxGF5",
      dimensions: { width: 100, height: 200 },
    });
  });

  it("records fetch failures and continues with other attachments", async () => {
    const fetchKind14Media = vi.fn(async (attachment: Kind14ImetaAttachment) => {
      if (attachment.url === attachmentA.url) {
        throw new MediaProcessingError("Failed to fetch blob: 404 Not Found", "fetch");
      }
      return { data: Buffer.from("ok"), mimeType: "application/pdf" };
    });
    const onError = vi.fn();

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA, attachmentB],
      fetchKind14Media,
      deriveKey: () => new Uint8Array(32),
      onError,
    });

    expect(result.succeeded).toHaveLength(1);
    expect(result.succeeded[0]?.originalUrl).toBe(attachmentB.url);
    expect(result.failed).toEqual([
      {
        index: 1,
        url: attachmentA.url,
        mimeType: attachmentA.mimeType,
        stage: "fetch",
        error: "Failed to fetch blob: 404 Not Found",
      },
    ]);
    expect(onError).toHaveBeenCalledOnce();
  });

  it("records decrypt failures with stage decrypt", async () => {
    const fetchKind14Media = vi.fn(async () => {
      throw new MediaProcessingError("NIP-44 decrypt failed", "decrypt");
    });

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA],
      fetchKind14Media,
      deriveKey: () => new Uint8Array(32),
    });

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([
      {
        index: 1,
        url: attachmentA.url,
        mimeType: attachmentA.mimeType,
        stage: "decrypt",
        error: "NIP-44 decrypt failed",
      },
    ]);
  });

  it("records verify failures with stage verify", async () => {
    const fetchKind14Media = vi.fn(async () => {
      throw new Kind14MediaProcessingError("SHA-256 mismatch", "verify");
    });

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA],
      fetchKind14Media,
      deriveKey: () => new Uint8Array(32),
    });

    expect(result.failed).toEqual([
      {
        index: 1,
        url: attachmentA.url,
        mimeType: attachmentA.mimeType,
        stage: "verify",
        error: "SHA-256 mismatch",
      },
    ]);
  });

  it("calls deriveKey once per batch", async () => {
    const deriveKey = vi.fn(() => new Uint8Array(32));
    const fetchKind14Media = vi.fn(async () => ({
      data: Buffer.from("ok"),
      mimeType: "image/jpeg",
    }));

    await processKind14ImetaAttachments({
      attachments: [attachmentA, attachmentB],
      fetchKind14Media,
      deriveKey,
    });

    expect(deriveKey).toHaveBeenCalledOnce();
  });
});

describe("processKind15FileAttachment", () => {
  const metadata = {
    url: "https://blossom.example/file",
    fileType: "image/jpeg",
    decryptionKey: "abc",
    decryptionNonce: "def",
  };

  it("returns empty results when metadata is null", async () => {
    const result = await processKind15FileAttachment({
      metadata: null,
      fetchAndDecrypt: vi.fn(),
    });

    expect(result).toEqual({ succeeded: [], failed: [] });
  });

  it("returns succeeded media when fetch and decrypt succeed", async () => {
    const fetchAndDecrypt = vi.fn(async () => ({
      data: Buffer.from("image-bytes"),
      mimeType: "image/jpeg",
    }));

    const result = await processKind15FileAttachment({
      metadata,
      fetchAndDecrypt,
    });

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(1);
    expect(result.succeeded[0]?.originalUrl).toBe(metadata.url);
  });

  it("records fetch failures", async () => {
    const fetchAndDecrypt = vi.fn(async () => {
      throw new MediaProcessingError("Failed to fetch file: 404 Not Found", "fetch");
    });

    const result = await processKind15FileAttachment({
      metadata,
      fetchAndDecrypt,
    });

    expect(result.succeeded).toEqual([]);
    expect(result.failed).toEqual([
      {
        index: 1,
        url: metadata.url,
        mimeType: metadata.fileType,
        stage: "fetch",
        error: "Failed to fetch file: 404 Not Found",
      },
    ]);
  });

  it("records decrypt failures when decryption key is missing", async () => {
    const fetchAndDecrypt = vi.fn(async () => {
      throw new MediaProcessingError(
        "Kind 15 file message missing decryption key or nonce",
        "decrypt",
      );
    });

    const result = await processKind15FileAttachment({
      metadata: { ...metadata, decryptionKey: undefined },
      fetchAndDecrypt,
    });

    expect(result.failed[0]).toMatchObject({
      stage: "decrypt",
      error: "Kind 15 file message missing decryption key or nonce",
    });
  });
});
