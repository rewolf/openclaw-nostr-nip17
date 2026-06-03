import { webcrypto } from "crypto";
import { MediaProcessingError } from "./media-handler.js";

/**
 * Parse kind 15 file message tags
 */
export interface Kind15FileMetadata {
  url: string;
  fileType?: string;
  encryptionAlgorithm?: string;
  decryptionKey?: string;
  decryptionNonce?: string;
  encryptedHash?: string;
  originalHash?: string;
  size?: number;
  dimensions?: { width: number; height: number };
  blurhash?: string;
  thumb?: string;
  fallbacks?: string[];
}

export function parseKind15Tags(tags: string[][]): Kind15FileMetadata | null {
  const metadata: Partial<Kind15FileMetadata> = {};
  
  for (const tag of tags) {
    const [key, ...values] = tag;
    
    switch (key) {
      case "file-type":
        metadata.fileType = values[0];
        break;
      case "encryption-algorithm":
        metadata.encryptionAlgorithm = values[0];
        break;
      case "decryption-key":
        metadata.decryptionKey = values[0];
        break;
      case "decryption-nonce":
        metadata.decryptionNonce = values[0];
        break;
      case "x":
        metadata.encryptedHash = values[0];
        break;
      case "ox":
        metadata.originalHash = values[0];
        break;
      case "size":
        metadata.size = parseInt(values[0], 10);
        break;
      case "dim":
        const dims = values[0].split("x");
        if (dims.length === 2) {
          metadata.dimensions = {
            width: parseInt(dims[0], 10),
            height: parseInt(dims[1], 10),
          };
        }
        break;
      case "blurhash":
        metadata.blurhash = values[0];
        break;
      case "thumb":
        metadata.thumb = values[0];
        break;
      case "fallback":
        if (!metadata.fallbacks) metadata.fallbacks = [];
        metadata.fallbacks.push(values[0]);
        break;
    }
  }
  
  // URL is in content for kind 15
  return metadata as Kind15FileMetadata;
}

/**
 * Decrypt AES-GCM encrypted file
 */
export async function decryptAesGcm(
  encryptedData: Uint8Array,
  keyEncoded: string,
  nonceEncoded: string,
): Promise<Buffer> {
  // Try to detect encoding: hex (64 chars) or base64
  // AES-256 key = 32 bytes = 64 hex chars or ~44 base64 chars
  const isHex = /^[0-9a-fA-F]{64}$/.test(keyEncoded.trim());
  
  const key = isHex 
    ? Buffer.from(keyEncoded.trim(), "hex")
    : Buffer.from(keyEncoded.trim(), "base64");
    
  const nonceIsHex = /^[0-9a-fA-F]{24}$/.test(nonceEncoded.trim());
  const nonce = nonceIsHex
    ? Buffer.from(nonceEncoded.trim(), "hex")
    : Buffer.from(nonceEncoded.trim(), "base64");
  
  // Import the key for AES-GCM
  const cryptoKey = await webcrypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  
  // Decrypt
  const decrypted = await webcrypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: nonce,
    },
    cryptoKey,
    encryptedData,
  );
  
  return Buffer.from(decrypted);
}

/**
 * Fetch and decrypt a kind 15 file
 */
export async function fetchAndDecryptKind15File(
  metadata: Kind15FileMetadata,
): Promise<{ data: Buffer; mimeType?: string }> {
  if (!metadata.url) {
    throw new MediaProcessingError("Kind 15 file message missing URL", "decrypt");
  }

  if (!metadata.decryptionKey || !metadata.decryptionNonce) {
    throw new MediaProcessingError(
      "Kind 15 file message missing decryption key or nonce",
      "decrypt",
    );
  }

  if (metadata.encryptionAlgorithm && metadata.encryptionAlgorithm !== "aes-gcm") {
    throw new MediaProcessingError(
      `Unsupported encryption algorithm: ${metadata.encryptionAlgorithm}`,
      "decrypt",
    );
  }

  const response = await fetch(metadata.url);
  if (!response.ok) {
    throw new MediaProcessingError(
      `Failed to fetch file: ${response.status} ${response.statusText}`,
      "fetch",
    );
  }

  const encryptedData = await response.arrayBuffer();

  let decrypted: Buffer;
  try {
    decrypted = await decryptAesGcm(
      new Uint8Array(encryptedData),
      metadata.decryptionKey,
      metadata.decryptionNonce,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new MediaProcessingError(message, "decrypt");
  }

  console.log(`[kind15] Decrypted ${decrypted.length} bytes, type: ${metadata.fileType}`);
  try {
    console.log(`[kind15] First 100 chars (utf8): ${decrypted.slice(0, 100).toString('utf8')}`);
  } catch {
    console.log(`[kind15] First 100 bytes (hex): ${decrypted.slice(0, 100).toString('hex')}`);
  }

  if (metadata.originalHash) {
    const hash = await webcrypto.subtle.digest("SHA-256", decrypted);
    const hashHex = Buffer.from(hash).toString("hex");
    console.log(`[kind15] Hash check: expected ${metadata.originalHash}, got ${hashHex}`);
    if (hashHex !== metadata.originalHash) {
      throw new MediaProcessingError("Decrypted file hash mismatch", "decrypt");
    }
  }

  return {
    data: decrypted,
    mimeType: metadata.fileType,
  };
}
