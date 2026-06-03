import { MediaProcessingError } from "./media-handler.js";
import {
  toFailedMediaAttachment,
  type FailedMediaAttachment,
  type MediaFailureStage,
} from "./inbound-media-context.js";

export type FetchAndDecryptBlobFn = (
  url: string,
  conversationKey: Uint8Array,
) => Promise<{ data: Buffer; mimeType?: string }>;

export function collectMediaFailure(
  err: unknown,
  meta: {
    index: number;
    url?: string;
    mimeType?: string;
    stage?: MediaFailureStage;
  },
): FailedMediaAttachment {
  const stage =
    err instanceof MediaProcessingError
      ? err.stage
      : meta.stage ?? "decrypt";
  return toFailedMediaAttachment(err, {
    index: meta.index,
    url: meta.url,
    mimeType: meta.mimeType,
    stage,
  });
}
