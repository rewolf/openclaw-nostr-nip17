import { describe, expect, it } from "vitest";
import {
  buildMediaFailureStructuredContext,
  prepareNonTextInboundMedia,
  type DecryptedMedia,
  type FailedMediaAttachment,
} from "./inbound-media-context.js";

describe("buildMediaFailureStructuredContext", () => {
  it("returns undefined when failures is empty", () => {
    expect(
      buildMediaFailureStructuredContext({
        failures: [],
        messageKind: 14,
        attempted: 0,
        succeeded: 0,
      }),
    ).toBeUndefined();
  });

  it("builds one entry with correct label, source, type, and payload counts", () => {
    const failures: FailedMediaAttachment[] = [
      {
        index: 1,
        url: "https://blossom.example/blob/abc",
        mimeType: "image/jpeg",
        stage: "fetch",
        error: "Failed to fetch blob: 404 Not Found",
      },
    ];

    const result = buildMediaFailureStructuredContext({
      failures,
      messageKind: 14,
      attempted: 1,
      succeeded: 0,
    });

    expect(result).toEqual([
      {
        label: "Failed media attachments",
        source: "nostr-nip17",
        type: "media_failure",
        payload: {
          message_kind: 14,
          attempted: 1,
          succeeded: 0,
          failures: [
            {
              index: 1,
              url: "https://blossom.example/blob/abc",
              mime_type: "image/jpeg",
              stage: "fetch",
              error: "Failed to fetch blob: 404 Not Found",
            },
          ],
        },
      },
    ]);
  });

  it("preserves multiple failures with 1-based index", () => {
    const failures: FailedMediaAttachment[] = [
      {
        index: 1,
        url: "https://blossom.example/a",
        mimeType: "image/jpeg",
        stage: "fetch",
        error: "404",
      },
      {
        index: 2,
        url: "https://blossom.example/b",
        mimeType: "application/pdf",
        stage: "decrypt",
        error: "decrypt failed",
      },
    ];

    const result = buildMediaFailureStructuredContext({
      failures,
      messageKind: 15,
      attempted: 2,
      succeeded: 0,
    });

    expect(result?.[0]?.payload).toMatchObject({
      message_kind: 15,
      attempted: 2,
      succeeded: 0,
      failures: [
        { index: 1, stage: "fetch" },
        { index: 2, stage: "decrypt" },
      ],
    });
  });

  it("includes verify stage failures in structured context payload", () => {
    const failures: FailedMediaAttachment[] = [
      {
        index: 1,
        url: "https://storage.example/photo.jpg",
        mimeType: "image/jpeg",
        stage: "verify",
        error: "SHA-256 mismatch",
      },
    ];

    const result = buildMediaFailureStructuredContext({
      failures,
      messageKind: 14,
      attempted: 1,
      succeeded: 0,
    });

    expect(result?.[0]?.payload).toMatchObject({
      failures: [{ stage: "verify", error: "SHA-256 mismatch" }],
    });
  });
});

describe("prepareNonTextInboundMedia", () => {
  const imageMedia: DecryptedMedia = {
    dataUrl: "data:image/jpeg;base64,QUJD",
    mimeType: "image/jpeg",
    originalUrl: "https://blossom.example/a",
  };

  it("saves non-text media and returns MediaPaths without structured context", () => {
    const written: Array<{ path: string; data: Buffer }> = [];

    const result = prepareNonTextInboundMedia({
      media: [imageMedia],
      busFailures: [],
      messageKind: 14,
      writeFile: (path, data) => {
        written.push({ path, data });
      },
      makeTempPath: (index, mimeType) => `/tmp/attachment-${index}.${mimeType?.split("/")[1] ?? "bin"}`,
    });

    expect(result.mediaPaths).toEqual(["/tmp/attachment-1.jpeg"]);
    expect(result.mediaTypes).toEqual(["image/jpeg"]);
    expect(result.failedMedia).toEqual([]);
    expect(result.untrustedStructuredContext).toBeUndefined();
    expect(written[0]?.data.toString()).toBe("ABC");
  });

  it("records save failures with stage save", () => {
    const result = prepareNonTextInboundMedia({
      media: [imageMedia],
      busFailures: [],
      messageKind: 14,
      writeFile: () => {
        throw new Error("disk full");
      },
      makeTempPath: () => "/tmp/attachment-1.jpeg",
    });

    expect(result.mediaPaths).toEqual([]);
    expect(result.failedMedia).toEqual([
      {
        index: 1,
        url: imageMedia.originalUrl,
        mimeType: "image/jpeg",
        stage: "save",
        error: "disk full",
      },
    ]);
    expect(result.untrustedStructuredContext?.[0]?.type).toBe("media_failure");
  });

  it("merges bus failures with save failures and reports partial success", () => {
    const busFailures: FailedMediaAttachment[] = [
      {
        index: 1,
        url: "https://blossom.example/missing",
        mimeType: "image/jpeg",
        stage: "fetch",
        error: "404",
      },
    ];

    const result = prepareNonTextInboundMedia({
      media: [imageMedia],
      busFailures,
      messageKind: 14,
      writeFile: (path, data) => {
        void path;
        void data;
      },
      makeTempPath: () => "/tmp/attachment-2.jpeg",
    });

    expect(result.mediaPaths).toEqual(["/tmp/attachment-2.jpeg"]);
    expect(result.failedMedia).toHaveLength(1);
    expect(result.failedMedia[0]).toMatchObject({ index: 1, stage: "fetch" });
    expect(result.untrustedStructuredContext?.[0]?.payload).toMatchObject({
      message_kind: 14,
      attempted: 2,
      succeeded: 1,
      failures: [{ index: 1, stage: "fetch" }],
    });
  });

  it("skips text media attachments", () => {
    const result = prepareNonTextInboundMedia({
      media: [
        {
          dataUrl: "data:text/plain;base64,aGVsbG8=",
          mimeType: "text/plain",
          originalUrl: "https://blossom.example/note.txt",
        },
        imageMedia,
      ],
      busFailures: [],
      messageKind: 14,
      writeFile: () => {},
      makeTempPath: () => "/tmp/attachment-1.jpeg",
    });

    expect(result.mediaPaths).toEqual(["/tmp/attachment-1.jpeg"]);
    expect(result.mediaTypes).toEqual(["image/jpeg"]);
  });
});
