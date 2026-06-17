/**
 * Strip content that could be used for prompt injection or that hides text
 * from human reviewers (invisible chars, HTML comments, image alt text, etc.)
 * before it is placed into Claude's prompt.
 */

export const stripHtmlComments = (content: string): string =>
  content.replace(/<!--[\s\S]*?-->/g, "");

// Code points for characters that are invisible or used to hide/obfuscate
// text. Built from explicit numbers so the source stays pure ASCII.
const INVISIBLE_RANGES: Array<[number, number]> = [
  [0x200b, 0x200d], // zero-width space / non-joiner / joiner
  [0xfeff, 0xfeff], // BOM / zero-width no-break space
  [0x0000, 0x0008], // C0 controls
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f], // DEL + C1 controls
  [0x00ad, 0x00ad], // soft hyphen
  [0x202a, 0x202e], // bidi embedding/override
  [0x2066, 0x2069], // bidi isolates
];

const INVISIBLE_RE = new RegExp(
  "[" +
    INVISIBLE_RANGES.map(([lo, hi]) => {
      const l = `\\u${lo.toString(16).padStart(4, "0")}`;
      const h = `\\u${hi.toString(16).padStart(4, "0")}`;
      return lo === hi ? l : `${l}-${h}`;
    }).join("") +
    "]",
  "g",
);

export function stripInvisibleCharacters(content: string): string {
  return content.replace(INVISIBLE_RE, "");
}

export function stripMarkdownImageAltText(content: string): string {
  return content.replace(/!\[[^\]]*\]\(/g, "![](");
}

export function stripMarkdownLinkTitles(content: string): string {
  content = content.replace(/(\[[^\]]*\]\([^)]+)\s+"[^"]*"/g, "$1");
  content = content.replace(/(\[[^\]]*\]\([^)]+)\s+'[^']*'/g, "$1");
  return content;
}

export function stripHiddenAttributes(content: string): string {
  const attrs = ["alt", "title", "aria-label", "placeholder"];
  for (const attr of attrs) {
    content = content.replace(
      new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, "gi"),
      "",
    );
    content = content.replace(
      new RegExp(`\\s${attr}\\s*=\\s*[^\\s>]+`, "gi"),
      "",
    );
  }
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*["'][^"']*["']/gi, "");
  content = content.replace(/\sdata-[a-zA-Z0-9-]+\s*=\s*[^\s>]+/gi, "");
  return content;
}

export function normalizeHtmlEntities(content: string): string {
  content = content.replace(/&#(\d+);/g, (_, dec) => {
    const num = parseInt(dec, 10);
    return num >= 32 && num <= 126 ? String.fromCharCode(num) : "";
  });
  content = content.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    const num = parseInt(hex, 16);
    return num >= 32 && num <= 126 ? String.fromCharCode(num) : "";
  });
  return content;
}

export function sanitizeContent(content: string): string {
  if (!content) return content;
  content = stripHtmlComments(content);
  content = stripInvisibleCharacters(content);
  content = stripMarkdownImageAltText(content);
  content = stripMarkdownLinkTitles(content);
  content = stripHiddenAttributes(content);
  content = normalizeHtmlEntities(content);
  return content;
}
