import type { DecryptedMedia, FailedMediaAttachment } from "./inbound-media-context.js";
import {
  collectMediaFailure,
  type FetchAndDecryptBlobFn,
} from "./inbound-media-failures.js";
import {
  mediaToDataUrl,
  type MediaAttachment,
} from "./media-handler.js";
import {
  fetchAndDecryptKind15File,
  type Kind15FileMetadata,
} from "./kind15-handler.js";

export async function processKind14ImetaAttachments(params: {
  attachments: MediaAttachment[];
  fetchAndDecrypt: FetchAndDecryptBlobFn;
  deriveKey: () => Uint8Array;
  onError?: (err: Error, context: string) => void;
}): Promise<{ succeeded: DecryptedMedia[]; failed: FailedMediaAttachment[] }> {
  const { attachments, fetchAndDecrypt, deriveKey, onError } = params;
  if (attachments.length === 0) {
    return { succeeded: [], failed: [] };
  }

  const conversationKey = deriveKey();
  const succeeded: DecryptedMedia[] = [];
  const failed: FailedMediaAttachment[] = [];

  for (let index = 0; index < attachments.length; index++) {
    const attachment = attachments[index];
    try {
      const { data, mimeType } = await fetchAndDecrypt(attachment.url, conversationKey);
      const effectiveMimeType = mimeType || attachment.mimeType;
      succeeded.push({
        dataUrl: mediaToDataUrl(data, effectiveMimeType),
        mimeType: effectiveMimeType,
        originalUrl: attachment.url,
        blurhash: attachment.blurhash,
        dimensions: attachment.dimensions,
      });
    } catch (err) {
      const failure = collectMediaFailure(err, {
        index: index + 1,
        url: attachment.url,
        mimeType: attachment.mimeType,
      });
      failed.push(failure);
      onError?.(err instanceof Error ? err : new Error(String(err)), `decrypt media ${attachment.url}`);
    }
  }

  return { succeeded, failed };
}

export async function processKind15FileAttachment(params: {
  metadata: Kind15FileMetadata | null;
  fetchAndDecrypt: typeof fetchAndDecryptKind15File;
  onError?: (err: Error, context: string) => void;
}): Promise<{ succeeded: DecryptedMedia[]; failed: FailedMediaAttachment[] }> {
  const { metadata, fetchAndDecrypt, onError } = params;
  if (!metadata) {
    return { succeeded: [], failed: [] };
  }

  try {
    const { data, mimeType } = await fetchAndDecrypt(metadata);
    return {
      succeeded: [
        {
          dataUrl: mediaToDataUrl(data, mimeType),
          mimeType,
          originalUrl: metadata.url,
          blurhash: metadata.blurhash,
          dimensions: metadata.dimensions,
        },
      ],
      failed: [],
    };
  } catch (err) {
    const failure = collectMediaFailure(err, {
      index: 1,
      url: metadata.url,
      mimeType: metadata.fileType,
    });
    onError?.(
      err instanceof Error ? err : new Error(String(err)),
      `decrypt kind 15 file ${metadata.url}`,
    );
    return { succeeded: [], failed: [failure] };
  }
}
