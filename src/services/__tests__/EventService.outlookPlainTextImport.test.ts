import { describe, expect, it } from 'vitest';

import { EventService } from '../EventService';

describe('EventService - Outlook PlainText HTML import', () => {
  it('htmlToSlateJsonWithRecognition should keep all PlainText div lines', () => {
    const outlookHtml = `
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
</head>
<body>
<div class="PlainText" style="font-size: 11pt;">12/29</div>
<div class="PlainText" style="font-size: 11pt;">伸展：腿部</div>
<div class="PlainText" style="font-size: 11pt;">力量：单腿哈克深蹲3组*左右*18-20-20</div>
<div class="PlainText" style="font-size: 11pt;">单腿哑铃硬拉（未完成）更换单腿硬拉3组*20</div>
<div class="PlainText" style="font-size: 11pt;">杠杆俯卧撑3组*20</div>
<div class="PlainText" style="font-size: 11pt;">山羊挺身侧腹2组*20*左右</div>
<div class="PlainText" style="font-size: 11pt;">史密斯辅助引体向上3组*20</div>
<div class="PlainText" style="font-size: 11pt;">2.5kg哑铃推肩3组*15-18-20</div>
<div class="PlainText" style="font-size: 11pt;">拉伸：腿部-上肢</div>
<div class="PlainText" style="font-size: 11pt;">---<br>
由 🔮 4DNote 创建于 2025-12-29 01:45:25</div>
</body>
</html>
`;

    const slateJson = (EventService as any).htmlToSlateJsonWithRecognition(outlookHtml) as string;
    const nodes = JSON.parse(slateJson) as any[];

    const paragraphs = nodes.filter(n => n && n.type === 'paragraph');
    const texts = paragraphs
      .map(p => (Array.isArray(p.children) ? p.children.map((c: any) => c?.text ?? '').join('') : ''))
      .map(t => t.trim())
      .filter(Boolean);

    // Expect multiple lines, not only the first one.
    expect(texts).toContain('12/29');
    expect(texts).toContain('伸展：腿部');
    expect(texts).toContain('力量：单腿哈克深蹲3组*左右*18-20-20');

    // Signature line should be cleaned by cleanupOutlookHtml.
    expect(texts.some(t => t.includes('由') && t.includes('创建于'))).toBe(false);
  });
});
