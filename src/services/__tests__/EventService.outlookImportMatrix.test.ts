import { describe, expect, it } from 'vitest';

import { EventService } from '@backend/EventService';

function extractParagraphTexts(slateJson: string): string[] {
  const nodes = JSON.parse(slateJson) as any[];
  const paragraphs = nodes.filter(n => n && n.type === 'paragraph');
  return paragraphs
    .map(p => (Array.isArray(p.children) ? p.children.map((c: any) => c?.text ?? '').join('') : ''))
    .map(t => t.trim())
    .filter(Boolean);
}

describe('EventService - Outlook import matrix', () => {
  it('does not emit per-block meta nodes for effectively empty content', () => {
    const now = 1735689600000;
    const event: any = {
      id: '00000000-0000-0000-0000-000000000031',
      source: 'local:test',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      description: '',
      eventlog: {
        slateJson: JSON.stringify([
          {
            type: 'paragraph',
            id: '00000000-0000-0000-0000-000000000032',
            createdAt: now,
            updatedAt: now,
            children: [{ text: '' }]
          }
        ])
      }
    };

    const html = (EventService as any).serializeEventDescription(event) as string;
    const base64 = (html.match(/id=['\"]4dnote-meta['\"][^>]*>([^<]+)</i)?.[1] || '').trim();
    expect(base64.length).toBeGreaterThan(50);

    const metaJson = decodeURIComponent(escape(atob(base64)));
    const meta = JSON.parse(metaJson);

    expect(meta.v).toBe(2);
    expect(meta.id).toBe(event.id);
    expect(Array.isArray(meta.slate?.nodes)).toBe(true);
    expect(meta.slate.nodes).toEqual([]);
  });

  it('keeps all .PlainText div lines (multiple divs)', () => {
    const outlookHtml = `
<html>
<body>
<div class="PlainText">Line 1</div>
<div class="PlainText">Line 2</div>
<div class="PlainText">---<br>由 🔮 4DNote 创建于 2025-12-29 01:45:25</div>
</body>
</html>`;

    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(outlookHtml) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toContain('Line 1');
    expect(texts).toContain('Line 2');
    expect(texts.some(t => t.includes('由') && t.includes('创建于'))).toBe(false);
  });

  it('splits encoded <br> into multiple paragraphs', () => {
    const outlookHtml = `
<html>
<body>
<div class="PlainText">Hello&amp;lt;br&amp;gt;World</div>
</body>
</html>`;

    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(outlookHtml) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toContain('Hello');
    expect(texts).toContain('World');
  });

  it('imports .MsoNormal paragraphs as multiple paragraphs', () => {
    const html = `
<html>
<body>
<p class="MsoNormal">Alpha</p>
<p class="MsoNormal">Beta</p>
</body>
</html>`;

    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(html) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toContain('Alpha');
    expect(texts).toContain('Beta');
  });

  it('splits plain text with CRLF into multiple paragraphs', () => {
    const text = 'A\r\nB\r\nC';
    const eventlog = (EventService as any).normalizeEventLog(text) as { slateJson: string };

    const texts = extractParagraphTexts(eventlog.slateJson);
    expect(texts).toEqual(['A', 'B', 'C']);
  });

  it('does not leak 4dnote-meta Base64 into imported paragraphs', () => {
    const event: any = {
      id: '00000000-0000-0000-0000-000000000001',
      source: 'local:test',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      description: 'Hello',
      eventlog: {
        slateJson: JSON.stringify([
          {
            type: 'paragraph',
            id: '00000000-0000-0000-0000-000000000002',
            createdAt: 1735689600000,
            updatedAt: 1735689600000,
            children: [{ text: 'Hello' }]
          }
        ])
      }
    };

    const html = (EventService as any).serializeEventDescription(event) as string;
    const deserialized = (EventService as any).deserializeEventDescription(html, event.id) as {
      eventlog: { slateJson: string };
    };

    const texts = extractParagraphTexts(deserialized.eventlog.slateJson);
    expect(texts).toContain('Hello');

    // Heuristic: a huge base64-looking token should never appear as a paragraph.
    const hasBase64Like = texts.some(t => {
      const compact = t.replace(/\s+/g, '');
      return compact.length >= 200 && /^[A-Za-z0-9+/=]+$/.test(compact);
    });
    expect(hasBase64Like).toBe(false);
  });

  it('htmlToSlateJsonWithRecognition ignores 4dnote-meta payload', () => {
    const event: any = {
      id: '00000000-0000-0000-0000-000000000011',
      source: 'local:test',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      description: 'Hello',
      eventlog: {
        slateJson: JSON.stringify([
          {
            type: 'paragraph',
            id: '00000000-0000-0000-0000-000000000012',
            createdAt: 1735689600000,
            updatedAt: 1735689600000,
            children: [{ text: 'Hello' }]
          }
        ])
      }
    };

    const html = (EventService as any).serializeEventDescription(event) as string;
    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(html) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toContain('Hello');

    const hasBase64Like = texts.some(t => {
      const compact = t.replace(/\s+/g, '');
      return compact.length >= 200 && /^[A-Za-z0-9+/=]+$/.test(compact);
    });
    expect(hasBase64Like).toBe(false);
  });

  it('drops leaked CompleteMetaV2 Base64 token when it becomes visible text', () => {
    const event: any = {
      id: '00000000-0000-0000-0000-000000000021',
      source: 'local:test',
      createdAt: '2026-01-01 00:00:00',
      updatedAt: '2026-01-01 00:00:00',
      description: 'Hello',
      eventlog: {
        slateJson: JSON.stringify([
          {
            type: 'paragraph',
            id: '00000000-0000-0000-0000-000000000022',
            createdAt: 1735689600000,
            updatedAt: 1735689600000,
            children: [{ text: 'Hello' }]
          }
        ])
      }
    };

    const serialized = (EventService as any).serializeEventDescription(event) as string;
    const base64 = (serialized.match(/id=['\"]4dnote-meta['\"][^>]*>([^<]+)</i)?.[1] || '').trim();
    expect(base64.length).toBeGreaterThan(200);

    const pollutedHtml = `<html><body><div class="PlainText">${base64}</div></body></html>`;
    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(pollutedHtml) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toEqual([]);
  });

  it('drops leaked empty Slate-JSON string artifact when it becomes visible text', () => {
    const leaked = '"[{\\"type\\":\\"paragraph\\",\\"children\\":[{\\"text\\":\\"\\"}],\\"id\\":\\"block_1767690283449_xg6oct\\"}]"';
    const pollutedHtml = `<html><body><div class="PlainText">${leaked}</div></body></html>`;
    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(pollutedHtml) as string;
    const texts = extractParagraphTexts(slateJson);

    expect(texts).toEqual([]);
  });
});
