import { createHash } from "crypto";
import * as nip44 from "nostr-tools/nip44";
import { base64 } from "@scure/base";
import type { Kind14ImetaAttachment } from "./kind14-imeta-tags.js";
import { MediaProcessingError } from "./media-handler.js";

export class Kind14MediaProcessingError extends Error {
  readonly stage: "fetch" | "decrypt" | "verify";

  constructor(message: string, stage: "fetch" | "decrypt" | "verify") {
    super(message);
    this.name = "Kind14MediaProcessingError";
    this.stage = stage;
  }
}

const NIP44_MIN_PAYLOAD_LEN = 132;
const NIP44_MAX_PAYLOAD_LEN = 87472;
const NIP44_MIN_DATA_LEN = 99;
const NIP44_MAX_DATA_LEN = 65603;

export function looksLikeNip44V2Payload(bytes: Buffer): boolean {
  const payload = bytes.toString("utf8").trim();
  if (payload.length < NIP44_MIN_PAYLOAD_LEN || payload.length > NIP44_MAX_PAYLOAD_LEN) {
    return false;
  }

  let data: Uint8Array;
  try {
    data = base64.decode(payload);
  } catch {
    return false;
  }

  if (data.length < NIP44_MIN_DATA_LEN || data.length > NIP44_MAX_DATA_LEN) {
    return false;
  }

  return data[0] === 2;
}

export function sniffMimeType(bytes: Buffer): string | undefined {
  if (bytes.length === 0) {
    return undefined;
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }

  return undefined;
}

export function verifySha256(bytes: Buffer, expectedHex: string): boolean {
  if (!/^[0-9a-fA-F]{64}$/.test(expectedHex)) {
    return false;
  }

  const actual = createHash("sha256").update(bytes).digest("hex");
  return actual.toLowerCase() === expectedHex.toLowerCase();
}

export function resolveKind14MimeType(
  attachment: Kind14ImetaAttachment,
  responseContentType: string | undefined,
  data: Buffer,
): string | undefined {
  if (attachment.mimeType) {
    return attachment.mimeType;
  }

  if (responseContentType) {
    return responseContentType.split(";")[0]?.trim() || undefined;
  }

  return sniffMimeType(data);
}

function isTextMimeType(mimeType?: string): boolean {
  return mimeType?.startsWith("text/") ?? false;
}

function looksLikeBase64(value: string): boolean {
  if (value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function decryptNip44Payload(payload: string, conversationKey: Uint8Array): Buffer {
  try {
    const decrypted = nip44.v2.decrypt(payload, conversationKey);
    return Buffer.from(decrypted, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MediaProcessingError(message, "decrypt");
  }
}

function decodeDecryptedMediaBytes(decrypted: Buffer, mimeType?: string): Buffer {
  if (isTextMimeType(mimeType)) {
    return decrypted;
  }

  const asString = decrypted.toString("utf8");
  if (looksLikeBase64(asString)) {
    try {
      return Buffer.from(asString, "base64");
    } catch {
      return decrypted;
    }
  }

  return decrypted;
}

async function fetchUrlBytes(url: string): Promise<{
  body: Buffer;
  contentType?: string;
}> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new MediaProcessingError(
        `Failed to fetch blob: ${response.status} ${response.statusText}`,
        "fetch",
      );
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") ?? undefined;
    return {
      body: Buffer.from(data),
      contentType: contentType || undefined,
    };
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new MediaProcessingError(message, "fetch");
  }
}

function verifyAttachmentSha256(data: Buffer, attachment: Kind14ImetaAttachment): void {
  if (!attachment.sha256) {
    return;
  }

  if (!verifySha256(data, attachment.sha256)) {
    throw new Kind14MediaProcessingError("SHA-256 mismatch", "verify");
  }
}

export type FetchKind14ImetaMediaFn = (
  attachment: Kind14ImetaAttachment,
  conversationKey: Uint8Array,
) => Promise<{ data: Buffer; mimeType?: string }>;

export async function fetchKind14ImetaMedia(
  attachment: Kind14ImetaAttachment,
  conversationKey: Uint8Array,
): Promise<{ data: Buffer; mimeType?: string }> {
  const { body, contentType } = await fetchUrlBytes(attachment.url);

  let data: Buffer;
  if (looksLikeNip44V2Payload(body)) {
    const payload = body.toString("utf8").trim();
    const decrypted = decryptNip44Payload(payload, conversationKey);
    data = decodeDecryptedMediaBytes(decrypted, attachment.mimeType);
  } else {
    data = body;
  }

  verifyAttachmentSha256(data, attachment);

  const mimeType = resolveKind14MimeType(attachment, contentType, data);
  return { data, mimeType };
}

export function getKind14MediaFailureStage(
  err: unknown,
): "fetch" | "decrypt" | "verify" | undefined {
  if (err instanceof Kind14MediaProcessingError) {
    return err.stage;
  }
  if (err instanceof MediaProcessingError) {
    return err.stage;
  }
  return undefined;
}
