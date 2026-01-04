export function cleanOutlookXmlTags(html: string): string {
  return html
    .replace(/<o:p>[\s\S]*?<\/o:p>/gi, '')
    .replace(/<w:sdtPr>[\s\S]*?<\/w:sdtPr>/gi, '')
    .replace(/xmlns:o="[^"]*"/gi, '')
    .replace(/xmlns:w="[^"]*"/gi, '');
}

export function processMsoLists(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const msoElements = Array.from(doc.querySelectorAll('p.MsoListParagraph, p[style*="mso-list"]'));

  if (msoElements.length === 0) return html;

  console.log('[processMsoLists] 发现', msoElements.length, '个 MsoList 段落');

  const listGroups: HTMLElement[][] = [];
  let currentGroup: HTMLElement[] = [];

  for (const element of msoElements) {
    if (isMsoListParagraph(element as HTMLElement)) {
      currentGroup.push(element as HTMLElement);
    } else if (currentGroup.length > 0) {
      listGroups.push(currentGroup);
      currentGroup = [];
    }
  }

  if (currentGroup.length > 0) listGroups.push(currentGroup);

  console.log('[processMsoLists] 识别到', listGroups.length, '个列表组');

  for (const group of listGroups) {
    const listType = extractMsoListType(group[0]);
    const listElement = doc.createElement(listType === 'numbered' ? 'ol' : 'ul');

    for (const p of group) {
      const li = doc.createElement('li');
      li.innerHTML = cleanMsoListText(p);

      const level = extractMsoListLevel(p);
      if (level > 1) {
        li.setAttribute('data-bullet-level', String(level - 1));
        li.style.marginLeft = `${(level - 1) * 20}px`;
      }

      listElement.appendChild(li);
    }

    group[0].replaceWith(listElement);
    for (let i = 1; i < group.length; i++) {
      group[i].remove();
    }
  }

  return doc.body.innerHTML;
}

function isMsoListParagraph(element: HTMLElement): boolean {
  const className = element.className || '';
  const style = element.getAttribute('style') || '';
  return className.includes('MsoListParagraph') || style.includes('mso-list:');
}

function extractMsoListLevel(element: HTMLElement): number {
  const style = element.getAttribute('style') || '';
  const match = style.match(/mso-list:.*?level(\d+)/);
  return match ? parseInt(match[1], 10) : 1;
}

function extractMsoListType(element: HTMLElement): 'numbered' | 'bullet' {
  const ignoreSpan = element.querySelector('[style*="mso-list:Ignore"]');
  if (ignoreSpan) {
    const text = (ignoreSpan.textContent || '').trim();
    if (/^[\d\w]+\.$/.test(text)) {
      return 'numbered';
    }
  }
  return 'bullet';
}

function cleanMsoListText(element: HTMLElement): string {
  const clone = element.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('[style*="mso-list:Ignore"]').forEach((el) => el.remove());

  let innerHtml = clone.innerHTML;
  innerHtml = innerHtml.replace(/<!\[if !supportLists\]>[\s\S]*?<!\[endif\]>/gi, '');

  return innerHtml.trim();
}

export function sanitizeInlineStyles(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const allElements = doc.querySelectorAll('[style]');
  allElements.forEach((element) => {
    sanitizeElementStyle(element as HTMLElement);
  });

  return doc.body.innerHTML;
}

export function removeOutlookSignatureFromHtml(html: string): string {
  let cleanedHtml = html;

  cleanedHtml = cleanedHtml.replace(
    /<(p|div)[^>]*>\s*---\s*<br\s*\/?>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi,
    ''
  );
  cleanedHtml = cleanedHtml.replace(
    /<(p|div)[^>]*>\s*由\s+(?:🔮|📧|🟣)?\s*(?:4DNote|Outlook|ReMarkable)\s*(?:创建于|编辑于|最后(?:修改|编辑)于)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\s\S]*?<\/(p|div)>/gi,
    ''
  );

  cleanedHtml = cleanedHtml.replace(/<(p|div)[^>]*>\s*---\s*<\/(p|div)>/gi, '');

  return cleanedHtml;
}

export function decodeHtmlEntitiesRecursively(html: string, maxIterations = 10): { decodedHtml: string; iterations: number } {
  let decodedHtml = html;
  let previousHtml = '';
  let iterations = 0;

  while (decodedHtml !== previousHtml && iterations < maxIterations) {
    previousHtml = decodedHtml;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = decodedHtml;
    decodedHtml = tempDiv.innerHTML;
    iterations++;
  }

  return { decodedHtml, iterations };
}

export function extractPlainTextPreservingBreaks(html: string): string {
  let htmlForExtraction = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n');

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlForExtraction;

  const bodyElement = tempDiv.querySelector('body');
  let textContent = (bodyElement || tempDiv).textContent || '';

  textContent = textContent.replace(/\n{3,}/g, '\n\n').trim();

  return textContent;
}

function sanitizeElementStyle(element: HTMLElement): void {
  const style = element.style;
  const cleanedStyles: Record<string, string> = {};

  const ALLOWED_STYLES: Record<string, string[] | boolean> = {
    'font-weight': ['bold', '700', '800', '900'],
    'font-style': ['italic'],
    'text-decoration': ['underline', 'line-through'],
    'background-color': true
  };

  const ALLOWED_HIGHLIGHT_COLORS = ['#ffff00', '#00ff00', '#ff00ff', '#ffa500', 'yellow', 'lime', 'cyan', 'magenta'];

  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    const value = style.getPropertyValue(prop);

    if (!ALLOWED_STYLES[prop]) continue;

    if (Array.isArray(ALLOWED_STYLES[prop])) {
      if ((ALLOWED_STYLES[prop] as string[]).includes(value)) {
        cleanedStyles[prop] = value;
      }
      continue;
    }

    if (prop === 'background-color') {
      const normalized = normalizeColor(value);
      if (
        ALLOWED_HIGHLIGHT_COLORS.includes(normalized) &&
        normalized !== '#000000' &&
        normalized !== '#ffffff'
      ) {
        cleanedStyles[prop] = value;

        const isLight = isLightColor(normalized);
        if (isLight) {
          cleanedStyles['color'] = '#000000';
        }
      }
    }
  }

  element.removeAttribute('style');
  Object.entries(cleanedStyles).forEach(([prop, value]) => {
    element.style.setProperty(prop, value);
  });
}

function isLightColor(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;

  const yiq = ((rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000);
  return yiq >= 128;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let normalized = hex.replace('#', '');
  if (normalized.length === 3) {
    normalized = normalized
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (normalized.length !== 6) return null;

  return {
    r: parseInt(normalized.substring(0, 2), 16),
    g: parseInt(normalized.substring(2, 4), 16),
    b: parseInt(normalized.substring(4, 6), 16)
  };
}

function normalizeColor(color: string): string {
  if (color.startsWith('rgb')) {
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }
  return color.toLowerCase();
}
