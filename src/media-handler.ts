import { getConversationKey } from "nostr-tools/nip44";
import * as nip44 from "nostr-tools/nip44";

/**
 * Parse imeta tags from a Nostr event
 * Returns array of {url, mimeType, blurhash, ...}
 */
export interface MediaAttachment {
  url: string;
  mimeType?: string;
  blurhash?: string;
  size?: number;
  dimensions?: { width: number; height: number };
}

export function parseImetaTags(tags: string[][]): MediaAttachment[] {
  const attachments: MediaAttachment[] = [];
  
  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;
    
    const attachment: MediaAttachment = { url: "" };
    
    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      if (part.startsWith("url ")) {
        attachment.url = part.slice(4).trim();
      } else if (part.startsWith("m ")) {
        attachment.mimeType = part.slice(2).trim();
      } else if (part.startsWith("blurhash ")) {
        attachment.blurhash = part.slice(9).trim();
      } else if (part.startsWith("size ")) {
        attachment.size = parseInt(part.slice(5).trim(), 10);
      } else if (part.startsWith("dim ")) {
        const dims = part.slice(4).trim().split("x");
        if (dims.length === 2) {
          attachment.dimensions = {
            width: parseInt(dims[0], 10),
            height: parseInt(dims[1], 10),
          };
        }
      }
    }
    
    if (attachment.url) {
      attachments.push(attachment);
    }
  }
  
  return attachments;
}

export type MediaFailureStage = "fetch" | "decrypt" | "save";

export class MediaProcessingError extends Error {
  readonly stage: MediaFailureStage;

  constructor(message: string, stage: MediaFailureStage) {
    super(message);
    this.name = "MediaProcessingError";
    this.stage = stage;
  }
}

async function fetchEncryptedBlob(url: string): Promise<{
  encryptedBytes: Uint8Array;
  mimeType?: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new MediaProcessingError(
      `Failed to fetch blob: ${response.status} ${response.statusText}`,
      "fetch",
    );
  }

  const encryptedData = await response.arrayBuffer();
  const contentType = response.headers.get("content-type");
  return {
    encryptedBytes: new Uint8Array(encryptedData),
    mimeType: contentType || undefined,
  };
}

function decryptNip44Blob(encryptedBytes: Uint8Array, conversationKey: Uint8Array): Buffer {
  try {
    const decrypted = nip44.v2.decrypt(
      Buffer.from(encryptedBytes).toString("base64"),
      conversationKey,
    );
    return Buffer.from(decrypted, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MediaProcessingError(message, "decrypt");
  }
}

/**
 * Fetch and decrypt a NIP-44 encrypted blob
 */
export async function fetchAndDecryptBlob(
  url: string,
  conversationKey: Uint8Array,
): Promise<{ data: Buffer; mimeType?: string }> {
  const { encryptedBytes, mimeType } = await fetchEncryptedBlob(url);
  const data = decryptNip44Blob(encryptedBytes, conversationKey);
  return { data, mimeType };
}

/**
 * Convert decrypted media to a data URL for agent consumption
 */
export function mediaToDataUrl(
  data: Buffer,
  mimeType?: string,
): string {
  const base64 = data.toString("base64");
  const type = mimeType || "application/octet-stream";
  return `data:${type};base64,${base64}`;
}

/**
 * Derive NIP-44 conversation key between sender and receiver
 */
export function deriveConversationKey(
  ourPrivateKey: Uint8Array,
  theirPublicKey: string,
): Uint8Array {
  return getConversationKey(ourPrivateKey, theirPublicKey);
}
