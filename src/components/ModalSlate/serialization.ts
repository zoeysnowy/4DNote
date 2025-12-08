/**
 * ModalSlate 序列化工具
 * 简化版本，专用于单内容编辑场景
 */

import { Descendant, Text } from 'slate';
import { 
  ParagraphNode, 
  CustomElement,
  TimestampDividerElement,
  TagNode,
  DateMentionNode
} from '../PlanSlate/types';

/**
 * 将 Slate JSON（字符串或对象）转换为 Slate nodes
 * 处理从 eventlog 字段读取的 JSON 数据
 */
export function jsonToSlateNodes(slateJson: string | any[] | undefined): Descendant[] {
  // 🔧 如果已经是数组对象，直接返回
  if (Array.isArray(slateJson)) {
    console.log('[jsonToSlateNodes] 输入已是数组，直接返回');
    return slateJson.length > 0 ? slateJson as Descendant[] : [{
      type: 'paragraph',
      children: [{ text: '' }]
    } as ParagraphNode];
  }
  
  // 处理空值或空字符串
  if (!slateJson || (typeof slateJson === 'string' && !slateJson.trim())) {
    console.log('[ModalSlate] 空内容，返回默认段落');
    return [{
      type: 'paragraph',
      children: [{ text: '' }]
    } as ParagraphNode];
  }

  try {
    // 尝试解析 JSON 字符串
    const parsed = JSON.parse(slateJson as string);
    // console.log('[jsonToSlateNodes] 解析成功:', parsed);
    // console.log('[jsonToSlateNodes] 是否为数组:', Array.isArray(parsed));
    
    // 如果是数组
    if (Array.isArray(parsed)) {
      // 验证数组内容，确保每个节点都有有效的结构
      if (parsed.length === 0) {
        // console.log('[ModalSlate] 空数组，返回默认段落');
        return [{
          type: 'paragraph',
          children: [{ text: '' }]
        } as ParagraphNode];
      }
      
      // 验证并修复每个节点
      const validatedNodes = parsed.map((node, index) => {
        if (typeof node !== 'object' || node === null) {
          console.warn(`[ModalSlate] 节点 ${index} 无效，转换为段落:`, node);
          return {
            type: 'paragraph',
            children: [{ text: String(node) }]
          } as ParagraphNode;
        }
        
        // 确保节点有 type 和 children
        if (!node.type) {
          node.type = 'paragraph';
        }
        
        if (!node.children || !Array.isArray(node.children)) {
          node.children = [{ text: '' }];
        }
        
        // 确保 children 中至少有一个文本节点
        if (node.children.length === 0) {
          node.children = [{ text: '' }];
        }
        
        return node;
      });
      
      return validatedNodes as Descendant[];
    }
    
    // 如果是单个对象，包装成数组
    if (typeof parsed === 'object' && parsed !== null) {
      const node = { ...parsed };
      
      // 确保节点结构有效
      if (!node.type) {
        node.type = 'paragraph';
      }
      if (!node.children || !Array.isArray(node.children)) {
        node.children = [{ text: '' }];
      }
      
      console.log('[ModalSlate] 单个对象转换为节点数组');
      return [node] as Descendant[];
    }
    
    // 其他情况，作为纯文本处理
    console.log('[ModalSlate] 非对象类型，转换为文本段落:', typeof parsed);
    return [{
      type: 'paragraph',
      children: [{ text: String(parsed) }]
    } as ParagraphNode];
    
  } catch (error) {
    console.error('[ModalSlate] JSON 解析失败，返回空段落。错误:', error);
    console.error('[ModalSlate] 原始内容:', slateJson);
    
    // JSON 解析失败，返回空段落而不是显示原始 JSON
    return [{
      type: 'paragraph',
      children: [{ text: '' }]
    } as ParagraphNode];
  }
}

/**
 * 将 Slate nodes 转换为 JSON 字符串
 * 保存到 eventlog 字段
 */
export function slateNodesToJson(nodes: Descendant[]): string {
  try {
    return JSON.stringify(nodes, null, 0); // 紧凑格式
  } catch (error) {
    console.error('[ModalSlate] Slate nodes 序列化失败:', error);
    return '[]'; // 返回空数组的 JSON
  }
}

/**
 * 将 Slate nodes 转换为 HTML 字符串（用于 description 字段同步）
 */
export function slateNodesToHtml(nodes: Descendant[]): string {
  return nodes
    .map(node => {
      if ('type' in node) {
        switch (node.type) {
          case 'paragraph':
            const text = extractTextFromNode(node);
            // 🆕 保留 bullet 属性
            const paraNode = node as any;
            if (paraNode.bullet && paraNode.bulletLevel !== undefined) {
              const attrs = `data-bullet="true" data-bullet-level="${paraNode.bulletLevel}"`;
              return `<p ${attrs}>${text}</p>`;
            }
            return text ? `<p>${text}</p>` : '';
          
          case 'timestamp-divider':
            const timestampElement = node as TimestampDividerElement;
            return `<div class="timestamp-divider" data-timestamp="${timestampElement.timestamp}">${timestampElement.displayText || new Date(timestampElement.timestamp).toLocaleString()}</div>`;
          
          case 'tag':
            const tagElement = node as TagNode;
            return `<span class="tag" data-tag-id="${tagElement.tagId}">${tagElement.tagName}</span>`;
          
          case 'date-mention':
            const dateElement = node as DateMentionNode;
            return `<span class="date-mention" data-date="${dateElement.startDate}">${dateElement.originalText || dateElement.startDate}</span>`;
          
          default:
            return extractTextFromNode(node);
        }
      }
      
      return Text.isText(node) ? node.text : '';
    })
    .filter(html => html.trim())
    .join('\n');
}

/**
 * 从节点中提取纯文本
 */
function extractTextFromNode(node: any): string {
  if (Text.isText(node)) {
    return node.text;
  }
  
  if ('children' in node && Array.isArray(node.children)) {
    return node.children
      .map((child: any) => extractTextFromNode(child))
      .join('');
  }
  
  return '';
}

/**
 * 将 Slate nodes 转换为纯文本（用于搜索等场景）
 */
export function slateNodesToPlainText(nodes: Descendant[]): string {
  return nodes
    .map(node => extractTextFromNode(node))
    .filter(text => text.trim())
    .join('\n');
}