/**
 * Outlook/Exchange HTML 清理（纯函数）
 *
 * 目标：把 Outlook/Exchange 常见的多层转义/模板噪音/签名/PlainText 分行统一收敛为更可解析的 HTML 片段。
 *
 * 注意：该函数不依赖 EventService，便于后续拆分 HTML Adapter。
 */
export function cleanupOutlookHtml(html: string): string {
  let cleaned = html;

  // 1️⃣ 递归解码 HTML 实体（最多解码 10 层，防止无限循环）
  for (let i = 0; i < 10; i++) {
    const before = cleaned;
    cleaned = cleaned
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

    // 如果没有变化，说明解码完成
    if (before === cleaned) break;
  }

  // 2️⃣ 移除 Exchange Server 模板代码
  cleaned = cleaned
    // 移除 <head> 标签及其内容
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    // 移除 meta 标签
    .replace(/<meta[^>]*>/gi, '')
    // 移除 style 标签
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // 移除注释
    .replace(/<!--[\s\S]*?-->/g, '')
    // 移除 font 和 span 包装（保留内容）
    .replace(/<\/?font[^>]*>/gi, '')
    .replace(/<\/?span[^>]*>/gi, '');

  // 3️⃣ 清理签名行（"由 XXX 创建于 YYYY-MM-DD HH:mm:ss"）
  cleaned = cleaned
    .replace(
      /---\s*<br[^>]*>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gi,
      ''
    )
    .replace(
      /由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后编辑于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/gi,
      ''
    );

  // 4️⃣ 清理多余的 <br> 标签（连续 3 个以上）
  cleaned = cleaned.replace(/(<br[^>]*>\s*){3,}/gi, '<br><br>');

  // 5️⃣ 提取 .PlainText 内容（如果存在）
  // Outlook/Exchange 常把正文拆成多个 <div class="PlainText">...</div>（每行一个）。
  // 旧逻辑只提取了第一个 div，导致正文被截断为“第一行”。
  const plainTextMatches = [
    ...cleaned.matchAll(/<div[^>]*class=["']PlainText["'][^>]*>([\s\S]*?)<\/div>/gi),
  ];
  if (plainTextMatches.length > 0) {
    cleaned = plainTextMatches.map(m => `<div>${m[1] ?? ''}</div>`).join('');
  }

  // 6️⃣ 清理多余的空白标签
  cleaned = cleaned
    .replace(/<div[^>]*>\s*<\/div>/gi, '')
    .replace(/<p[^>]*>\s*<\/p>/gi, '');

  return cleaned.trim();
}
