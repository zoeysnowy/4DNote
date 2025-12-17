/**
 * HTML 图片提取工具
 * 从 HTML 字符串中提取图片，用于 OCR 和 QR 码识别
 */

export interface ExtractedImage {
  url: string;          // 图片 URL 或 base64
  alt?: string;         // alt 文本
  width?: number;       // 宽度
  height?: number;      // 高度
  index: number;        // 在 HTML 中的顺序
}

/**
 * 从 HTML 字符串中提取所有图片
 */
export function extractImagesFromHTML(html: string): ExtractedImage[] {
  if (!html) return [];

  const images: ExtractedImage[] = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imgElements = doc.querySelectorAll('img');

  imgElements.forEach((img, index) => {
    const src = img.getAttribute('src');
    if (src) {
      images.push({
        url: src,
        alt: img.getAttribute('alt') || undefined,
        width: img.width || undefined,
        height: img.height || undefined,
        index
      });
    }
  });

  console.log(`[htmlImageExtractor] 从 HTML 中提取了 ${images.length} 张图片`);
  return images;
}

/**
 * 将图片 URL 转换为 Blob（用于 OCR/QR 处理）
 */
export async function imageUrlToBlob(url: string): Promise<Blob> {
  // 如果是 base64
  if (url.startsWith('data:image/')) {
    const base64Data = url.split(',')[1];
    const mimeType = url.split(':')[1].split(';')[0];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  // 如果是 URL，fetch 下载
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return await response.blob();
}

/**
 * 从 EventLog 的 HTML 字段中提取图片
 * @param eventlog EventLog 对象或 HTML 字符串
 */
export function extractImagesFromEventLog(eventlog: any): ExtractedImage[] {
  if (!eventlog) return [];

  let html: string;

  // 兼容新旧格式
  if (typeof eventlog === 'string') {
    // 旧格式：HTML 字符串
    html = eventlog;
  } else if (typeof eventlog === 'object' && eventlog.html) {
    // 新格式：EventLog 对象
    html = eventlog.html;
  } else {
    return [];
  }

  return extractImagesFromHTML(html);
}

/**
 * 批量将图片 URL 转换为 Blob
 */
export async function extractedImagesToBlobs(images: ExtractedImage[]): Promise<Array<{ image: Blob; metadata: ExtractedImage }>> {
  const results: Array<{ image: Blob; metadata: ExtractedImage }> = [];

  for (const img of images) {
    try {
      const blob = await imageUrlToBlob(img.url);
      results.push({ image: blob, metadata: img });
      console.log(`[htmlImageExtractor] ✅ 转换图片成功:`, img.alt || img.url.substring(0, 50));
    } catch (error) {
      console.error(`[htmlImageExtractor] ❌ 转换图片失败:`, img.url, error);
    }
  }

  return results;
}
