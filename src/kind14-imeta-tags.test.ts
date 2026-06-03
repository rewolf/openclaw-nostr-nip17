import { describe, expect, it } from "vitest";
import { parseKind14ImetaTags } from "./kind14-imeta-tags.js";

const SHA256_HEX =
  "a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3";

describe("parseKind14ImetaTags", () => {
  it("1.1 parses full imeta tag with all fields including x", () => {
    const tags = [
      [
        "imeta",
        "url https://x/a.jpg",
        "m image/jpeg",
        "blurhash LxGF5...",
        "size 12345",
        "dim 800x600",
        `x ${SHA256_HEX}`,
      ],
    ];

    expect(parseKind14ImetaTags(tags)).toEqual([
      {
        url: "https://x/a.jpg",
        mimeType: "image/jpeg",
        blurhash: "LxGF5...",
        size: 12345,
        dimensions: { width: 800, height: 600 },
        sha256: SHA256_HEX.toLowerCase(),
      },
    ]);
  });

  it("1.2 parses minimal imeta with url only", () => {
    expect(parseKind14ImetaTags([["imeta", "url https://x/a.jpg"]])).toEqual([
      { url: "https://x/a.jpg" },
    ]);
  });

  it("1.3 skips imeta without url", () => {
    expect(parseKind14ImetaTags([["imeta", "m image/jpeg"]])).toEqual([]);
  });

  it("1.4 ignores non-imeta tags", () => {
    expect(
      parseKind14ImetaTags([
        ["p", "pubkey"],
        ["imeta", "url https://x/a.jpg"],
      ]),
    ).toEqual([{ url: "https://x/a.jpg" }]);
  });

  it("1.5 parses multiple imeta tags in order", () => {
    expect(
      parseKind14ImetaTags([
        ["imeta", "url https://x/a.jpg"],
        ["imeta", "url https://x/b.png", "m image/png"],
      ]),
    ).toEqual([
      { url: "https://x/a.jpg" },
      { url: "https://x/b.png", mimeType: "image/png" },
    ]);
  });

  it("1.6 returns empty array for empty tags", () => {
    expect(parseKind14ImetaTags([])).toEqual([]);
  });

  it("1.7 ignores malformed dim but keeps url", () => {
    expect(
      parseKind14ImetaTags([["imeta", "url https://x/a.jpg", "dim not-a-dimension"]]),
    ).toEqual([{ url: "https://x/a.jpg" }]);
  });

  it("1.8 ignores non-numeric size", () => {
    expect(
      parseKind14ImetaTags([
        ["imeta", "url https://x/a.jpg", "size not-a-number"],
      ]),
    ).toEqual([{ url: "https://x/a.jpg" }]);
  });

  it("1.9 trims url and mime whitespace", () => {
    expect(
      parseKind14ImetaTags([
        ["imeta", "url  https://x/a.jpg  ", "m  image/png  "],
      ]),
    ).toEqual([{ url: "https://x/a.jpg", mimeType: "image/png" }]);
  });

  it("1.10 normalizes x tag hex to lowercase", () => {
    const upper = SHA256_HEX.toUpperCase();
    expect(parseKind14ImetaTags([["imeta", "url https://x/a.jpg", `x ${upper}`]])).toEqual([
      { url: "https://x/a.jpg", sha256: SHA256_HEX.toLowerCase() },
    ]);
  });
});
