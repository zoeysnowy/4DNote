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
});
