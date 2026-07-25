/**
 * Parses post content into segments so that `>>ABC123` references can be
 * rendered as interactive links. References are matched as `>>` followed by
 * exactly 6 hex chars, which matches the short-id convention used everywhere
 * else (`post.id.slice(2, 8)`).
 */
export interface ContentSegment {
  text: string;
  /** When set, this segment is a `>>HASH` reference and `text` is the literal
   *  `>>hash` string (lowercased). The referenced post is looked up by the
   *  caller using `ref` as the 6-char short id. */
  ref?: string;
}

const REF_RE = />>([0-9a-fA-F]{6})/g;

export function parseContent(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  let last = 0;
  for (const m of content.matchAll(REF_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) segments.push({ text: content.slice(last, idx) });
    segments.push({ text: m[0], ref: m[1].toLowerCase() });
    last = idx + m[0].length;
  }
  if (last < content.length) segments.push({ text: content.slice(last) });
  return segments.length > 0 ? segments : [{ text: '' }];
}
