import type { Event, EventLog, EventTitle } from '@frontend/types';

export type GetTagLabel = (tagId: string) => string | undefined;

export interface TitleResolverDeps {
  getTagLabel?: GetTagLabel;
}

export interface ResolveTitleOptions {
  maxLength?: number;
  fallback?: string;
  preferredLayer?: 'colorTitle' | 'simpleTitle' | 'fullTitle';
}

const DEFAULT_FALLBACK = 'Untitled';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function looksLikeSlateJsonText(value: string): boolean {
  const t = value.trim();
  if (!t) return false;
  if (t === '[]') return true;
  if (t.startsWith('[{') || t.startsWith('[ {')) return true;
  if (t.startsWith('"[{') || t.startsWith('"[ {')) return true;
  // Common corrupt form: a JSON-ish payload with escaped quotes.
  if ((t.startsWith('[') || t.startsWith('{')) && t.includes('\\"type\\"')) return true;
  if ((t.startsWith('[') || t.startsWith('{')) && t.includes('children')) return true;
  return false;
}

function stripLeadingTimestampBlocks(raw: string): string {
  // Remove leading timestamp divider lines and signature lines so the title starts from user content.
  // Supported timestamp formats follow EventService parsing rules.
  const timestampPattern = /^(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\s+\d{2}:\d{2}:\d{2})(?:\s*\|\s*[^\n]+)?/;
  const signatureLinePattern = /^\s*(?:由\s+.+?\s+)?(?:创建于|最后修改于|最后编辑于|编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}.*$/;

  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];

  let i = 0;
  // Drop leading timestamp-only lines / signature lines.
  while (i < lines.length) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (signatureLinePattern.test(trimmed)) {
      i++;
      continue;
    }

    const m = trimmed.match(timestampPattern);
    if (m) {
      const rest = trimmed.slice(m[0].length).trim();
      if (!rest) {
        // A pure timestamp divider line: skip it.
        i++;
        continue;
      }
      // Timestamp prefix + content: keep only the content.
      out.push(rest);
      i++;
      break;
    }

    // First meaningful line without timestamp.
    out.push(trimmed);
    i++;
    break;
  }

  // Append remaining non-empty lines (as-is).
  for (; i < lines.length; i++) {
    const line = (lines[i] ?? '').trim();
    if (!line) continue;
    if (signatureLinePattern.test(line)) continue;
    out.push(line);
  }

  return out.join('\n');
}

function clampWithEllipsis(text: string, maxLength?: number): string {
  if (!maxLength || maxLength <= 0) return text;
  if (text.length <= maxLength) return text;
  if (maxLength === 1) return '…';
  return `${text.slice(0, maxLength - 1)}…`;
}

function extractPlainTextFromSlateJson(slateJson: string): string {
  try {
    const decode = (value: unknown, depth: number): any => {
      if (depth <= 0) return value;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return '';
        // If string looks like JSON, try parse.
        if (trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('"')) {
          try {
            return decode(JSON.parse(trimmed), depth - 1);
          } catch {
            // Handle corrupt/escaped JSON like `[{\"type\":\"paragraph\",...}]`.
            if ((trimmed.startsWith('[') || trimmed.startsWith('{')) && trimmed.includes('\\"')) {
              try {
                const unescaped = trimmed.replace(/\\"/g, '"');
                return decode(JSON.parse(unescaped), depth - 1);
              } catch {
                return value;
              }
            }
            return value;
          }
        }
        return value;
      }
      return value;
    };

    const decoded = decode(slateJson, 2);
    const nodes = Array.isArray(decoded) ? decoded : (decoded ? [decoded] : []);
    if (nodes.length === 0) return '';

    const extractFromNode = (node: any): string => {
      if (!node || typeof node !== 'object') return '';
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.children)) {
        return node.children.map(extractFromNode).join('');
      }
      return '';
    };

    const raw = nodes.map(extractFromNode).join('\n');
    return normalizeWhitespace(raw);
  } catch {
    return '';
  }
}

function extractPlainTextFromTitleLayer(layerValue: string): string {
  // 兼容：历史数据可能直接存纯文本；新数据可能是 Slate JSON
  const fromSlate = extractPlainTextFromSlateJson(layerValue);
  if (isNonEmptyString(fromSlate)) return fromSlate;

  // Never leak raw Slate JSON (or escaped Slate JSON) into UI.
  if (looksLikeSlateJsonText(layerValue)) return '';

  return normalizeWhitespace(layerValue);
}

function resolveFromTitle(title: EventTitle | undefined, preferredLayer: ResolveTitleOptions['preferredLayer']): string | undefined {
  if (!title) return undefined;

  const tryLayer = (layer?: string): string | undefined => {
    if (!isNonEmptyString(layer)) return undefined;
    const extracted = extractPlainTextFromTitleLayer(layer);
    if (!isNonEmptyString(extracted)) return undefined;

    // Legacy/auto-generated titles may be pure timestamps; strip them so we fall back to user content.
    const stripped = stripLeadingTimestampBlocks(extracted);
    const normalized = normalizeWhitespace(stripped);
    return isNonEmptyString(normalized) ? normalized : undefined;
  };

  const inOrder: Array<keyof EventTitle> =
    preferredLayer === 'simpleTitle'
      ? ['simpleTitle', 'colorTitle', 'fullTitle']
      : preferredLayer === 'fullTitle'
        ? ['fullTitle', 'colorTitle', 'simpleTitle']
        : ['colorTitle', 'simpleTitle', 'fullTitle'];

  for (const key of inOrder) {
    const candidate = tryLayer(title[key] as string | undefined);
    if (candidate) return candidate;
  }

  return undefined;
}

function resolveFromTags(tags: unknown, deps?: TitleResolverDeps): string | undefined {
  if (!Array.isArray(tags) || tags.length === 0) return undefined;

  for (const tag of tags) {
    if (!isNonEmptyString(tag)) continue;
    const label = deps?.getTagLabel?.(tag) ?? tag;
    const normalized = normalizeWhitespace(label);
    if (isNonEmptyString(normalized)) return normalized;
  }

  return undefined;
}

function resolveFromEventLog(eventlog: EventLog | string | undefined): string | undefined {
  if (!eventlog) return undefined;

  const asText = (value: unknown): string | undefined => {
    if (!isNonEmptyString(value)) return undefined;
    // Avoid HTML tags leaking into titles.
    const withoutTags = value.replace(/<[^>]*>/g, ' ');
    const stripped = stripLeadingTimestampBlocks(withoutTags);
    const normalized = normalizeWhitespace(stripped);
    return isNonEmptyString(normalized) ? normalized : undefined;
  };

  if (typeof eventlog === 'string') return asText(eventlog);

  return (
    asText(eventlog.plainText) ||
    asText(eventlog.html) ||
    (isNonEmptyString(eventlog.slateJson) ? asText(extractPlainTextFromSlateJson(eventlog.slateJson)) : undefined)
  );
}

function summarize(text: string, maxChars: number): string {
  const normalized = normalizeWhitespace(text);
  if (!isNonEmptyString(normalized)) return '';
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…`;
}

/**
 * 展示标题（默认偏好 colorTitle），但不会回写到 Event。
 */
export function resolveDisplayTitle(event: Partial<Event> | undefined, deps?: TitleResolverDeps, options?: ResolveTitleOptions): string {
  const fallback = options?.fallback ?? DEFAULT_FALLBACK;
  const preferredLayer = options?.preferredLayer ?? 'colorTitle';

  const fromTitle = resolveFromTitle(event?.title, preferredLayer);
  const fromTags = resolveFromTags((event as any)?.tags, deps);
  const fromEventLogRaw = resolveFromEventLog(event?.eventlog as any);
  const fromEventLog = fromEventLogRaw ? summarize(fromEventLogRaw, options?.maxLength ?? 10) : undefined;

  const resolved = fromTitle || fromTags || fromEventLog || fallback;
  return clampWithEllipsis(resolved, options?.maxLength);
}

/**
 * 同步标题（严格偏好 simpleTitle；外部同步 subject/title 使用）。
 * 若 simpleTitle 缺失，则按 tags/eventlog 兜底，但不会回写。
 */
export function resolveSyncTitle(event: Partial<Event> | undefined, deps?: TitleResolverDeps, options?: ResolveTitleOptions): string {
  const fallback = options?.fallback ?? 'Untitled Event';

  const fromTitle = resolveFromTitle(event?.title, 'simpleTitle');
  const fromTags = resolveFromTags((event as any)?.tags, deps);
  const fromEventLogRaw = resolveFromEventLog(event?.eventlog as any);
  const fromEventLog = fromEventLogRaw ? summarize(fromEventLogRaw, options?.maxLength ?? 10) : undefined;

  const resolved = fromTitle || fromTags || fromEventLog || fallback;
  return clampWithEllipsis(resolved, options?.maxLength);
}
