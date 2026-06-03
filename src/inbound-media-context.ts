export type MediaFailureStage = "fetch" | "decrypt" | "save" | "verify";

export interface DecryptedMedia {
  dataUrl: string;
  mimeType?: string;
  originalUrl: string;
  blurhash?: string;
  dimensions?: { width: number; height: number };
}

export interface FailedMediaAttachment {
  index: number;
  url?: string;
  mimeType?: string;
  stage: MediaFailureStage;
  error: string;
}

export interface UntrustedStructuredContextEntry {
  label: string;
  source?: string;
  type?: string;
  payload: unknown;
}

export function toFailedMediaAttachment(
  err: unknown,
  meta: {
    index: number;
    url?: string;
    mimeType?: string;
    stage: MediaFailureStage;
  },
): FailedMediaAttachment {
  const error = err instanceof Error ? err.message : String(err);
  return {
    index: meta.index,
    url: meta.url,
    mimeType: meta.mimeType,
    stage: meta.stage,
    error,
  };
}

export function buildMediaFailureStructuredContext(params: {
  failures: FailedMediaAttachment[];
  messageKind: 14 | 15;
  attempted: number;
  succeeded: number;
}): UntrustedStructuredContextEntry[] | undefined {
  if (params.failures.length === 0) {
    return undefined;
  }

  return [
    {
      label: "Failed media attachments",
      source: "nostr-nip17",
      type: "media_failure",
      payload: {
        message_kind: params.messageKind,
        attempted: params.attempted,
        succeeded: params.succeeded,
        failures: params.failures.map((failure) => ({
          index: failure.index,
          url: failure.url,
          mime_type: failure.mimeType,
          stage: failure.stage,
          error: failure.error,
        })),
      },
    },
  ];
}

function decodeDataUrl(dataUrl: string): Buffer {
  const base64Content = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
  return Buffer.from(base64Content ?? "", "base64");
}

export function prepareNonTextInboundMedia(params: {
  media: DecryptedMedia[];
  busFailures: FailedMediaAttachment[];
  messageKind: 14 | 15;
  writeFile: (path: string, data: Buffer) => void;
  makeTempPath: (index: number, mimeType?: string) => string;
}): {
  mediaPaths: string[];
  mediaTypes: string[];
  failedMedia: FailedMediaAttachment[];
  untrustedStructuredContext?: UntrustedStructuredContextEntry[];
} {
  const mediaPaths: string[] = [];
  const mediaTypes: string[] = [];
  const saveFailures: FailedMediaAttachment[] = [];
  const nonTextMedia = params.media.filter((item) => !item.mimeType?.startsWith("text/"));

  let nextIndex =
    params.busFailures.reduce((max, failure) => Math.max(max, failure.index), 0) + 1;

  for (const item of nonTextMedia) {
    const attachmentIndex = nextIndex;
    nextIndex += 1;
    const filePath = params.makeTempPath(attachmentIndex, item.mimeType);

    try {
      params.writeFile(filePath, decodeDataUrl(item.dataUrl));
      mediaPaths.push(filePath);
      if (item.mimeType) {
        mediaTypes.push(item.mimeType);
      }
    } catch (err) {
      saveFailures.push(
        toFailedMediaAttachment(err, {
          index: attachmentIndex,
          url: item.originalUrl,
          mimeType: item.mimeType,
          stage: "save",
        }),
      );
    }
  }

  const failedMedia = [...params.busFailures, ...saveFailures];
  const attempted = params.busFailures.length + nonTextMedia.length;
  const succeeded = mediaPaths.length;

  return {
    mediaPaths,
    mediaTypes,
    failedMedia,
    untrustedStructuredContext: buildMediaFailureStructuredContext({
      failures: failedMedia,
      messageKind: params.messageKind,
      attempted,
      succeeded,
    }),
  };
}
