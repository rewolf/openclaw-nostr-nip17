export interface Kind14ImetaAttachment {
  url: string;
  mimeType?: string;
  blurhash?: string;
  size?: number;
  dimensions?: { width: number; height: number };
  sha256?: string;
}

export function parseKind14ImetaTags(tags: string[][]): Kind14ImetaAttachment[] {
  const attachments: Kind14ImetaAttachment[] = [];

  for (const tag of tags) {
    if (tag[0] !== "imeta") continue;

    const attachment: Kind14ImetaAttachment = { url: "" };

    for (let i = 1; i < tag.length; i++) {
      const part = tag[i];
      if (part.startsWith("url ")) {
        attachment.url = part.slice(4).trim();
      } else if (part.startsWith("m ")) {
        attachment.mimeType = part.slice(2).trim();
      } else if (part.startsWith("blurhash ")) {
        attachment.blurhash = part.slice(9).trim();
      } else if (part.startsWith("size ")) {
        const size = parseInt(part.slice(5).trim(), 10);
        if (!Number.isNaN(size)) {
          attachment.size = size;
        }
      } else if (part.startsWith("dim ")) {
        const dims = part.slice(4).trim().split("x");
        if (dims.length === 2) {
          const width = parseInt(dims[0], 10);
          const height = parseInt(dims[1], 10);
          if (!Number.isNaN(width) && !Number.isNaN(height)) {
            attachment.dimensions = { width, height };
          }
        }
      } else if (part.startsWith("x ")) {
        attachment.sha256 = part.slice(2).trim().toLowerCase();
      }
    }

    if (attachment.url) {
      attachments.push(attachment);
    }
  }

  return attachments;
}
