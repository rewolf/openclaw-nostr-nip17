import { describe, expect, it, vi } from "vitest";
import { MediaProcessingError } from "./media-handler.js";
import type { MediaAttachment } from "./media-handler.js";
import { processKind14ImetaAttachments, processKind15FileAttachment } from "./inbound-media-processing.js";

const attachmentA: MediaAttachment = {
  url: "https://blossom.example/a",
  mimeType: "image/jpeg",
};

const attachmentB: MediaAttachment = {
  url: "https://blossom.example/b",
  mimeType: "application/pdf",
};

describe("processKind14ImetaAttachments", () => {
  it("returns empty results for empty attachments", async () => {
    const result = await processKind14ImetaAttachments({
      attachments: [],
      fetchAndDecrypt: vi.fn(),
      deriveKey: () => new Uint8Array(32),
    });

    expect(result).toEqual({ succeeded: [], failed: [] });
  });

  it("returns succeeded media when all attachments decrypt", async () => {
    const fetchAndDecrypt = vi.fn(async (url: string) => ({
      data: Buffer.from(`data-${url}`),
      mimeType: "image/jpeg",
    }));

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA, attachmentB],
      fetchAndDecrypt,
      deriveKey: () => new Uint8Array(32),
    });

    expect(result.failed).toEqual([]);
    expect(result.succeeded).toHaveLength(2);
    expect(result.succeeded[0]?.originalUrl).toBe(attachmentA.url);
    expect(result.succeeded[1]?.originalUrl).toBe(attachmentB.url);
  });

  it("records fetch failures and continues with other attachments", async () => {
    const fetchAndDecrypt = vi.fn(async (url: string) => {
      if (url === attachmentA.url) {
        throw new MediaProcessingError("Failed to fetch blob: 404 Not Found", "fetch");
      }
      return { data: Buffer.from("ok"), mimeType: "application/pdf" };
    });
    const onError = vi.fn();

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA, attachmentB],
      fetchAndDecrypt,
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
    const fetchAndDecrypt = vi.fn(async () => {
      throw new MediaProcessingError("NIP-44 decrypt failed", "decrypt");
    });

    const result = await processKind14ImetaAttachments({
      attachments: [attachmentA],
      fetchAndDecrypt,
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
