/**
 * 序列化/反序列化工具
 * 
 * 负责 Slate 节点 ↔ PlanItem 数组的双向转换
 */

import { Descendant, Text, Editor, Transforms, Node as SlateNode, Path } from 'slate';
import { formatTimeForStorage } from '../../utils/timeUtils';
import { 
  EventLineNode, 
  ParagraphNode, 
  TextNode, 
  TagNode, 
  DateMentionNode,
  CustomElement,
  EventLineData,
  EventMetadata,  // 🆕 导入 EventMetadata 类型
} from './types';
import { TimeHub } from '../../services/TimeHub';  // 🆕 导入 TimeHub
import { generateEventId } from '../../utils/idGenerator';  // 🆕 v2.17: UUID 生成器

// ==================== 层级同步工具函数 ====================

/**
 * 🔥 v2.20.0: 统一的层级更新函数
 * 
 * 同时更新 EventLineNode.level 和 metadata.bulletLevel，避免不一致
 * 
 * @param editor Slate 编辑器实例
 * @param path EventLineNode 的路径
 * @param newLevel 新的层级值
 */
export function setEventLineLevel(
  editor: Editor,
  path: Path,
  newLevel: number
): void {
  const currentNode = SlateNode.get(editor, path) as unknown as EventLineNode;
  
  Transforms.setNodes(
    editor,
    { 
      level: newLevel,  // Slate 视觉层级
      metadata: {
        ...(currentNode.metadata || {}),
        bulletLevel: newLevel,  // 🔥 数据持久层级（必须同步）
      }
    } as unknown as Partial<SlateNode>,
    { at: path }
  );
  
  console.log('[setEventLineLevel] Level synchronized:', {
    eventId: currentNode.eventId?.slice(-8) || 'unknown',
    path,
    newLevel,
    oldLevel: currentNode.level,
    oldBulletLevel: currentNode.metadata?.bulletLevel
  });
}

// ==================== PlanItem → Slate 节点 ====================

/**
 * 将 PlanItem 数组转换为 Slate 节点数组
 */
export function planItemsToSlateNodes(items: any[]): EventLineNode[] {
  const nodes: EventLineNode[] = [];
  
  // 加载事件到 Slate 节点
  
  items.forEach(item => {
    // 🆕 v1.6: 提取完整元数据（透传所有业务字段）
    const metadata: EventMetadata = {
      // ✅ v1.8: 时间字段保留 undefined（不转换为 null）
      startTime: item.startTime,
      endTime: item.endTime,
      dueDateTime: item.dueDateTime,
      isAllDay: item.isAllDay,
      timeSpec: item.timeSpec,
      
      // 样式字段
      emoji: item.emoji,
      color: item.color,
      
      // 业务字段
      priority: item.priority,
      isCompleted: item.isCompleted,
      isTask: item.isTask,
      type: item.type,
      checkType: item.checkType, // ✅ 不添加默认值，保持原样
      
      // ✅ v2.14: Checkbox 状态数组（用于 EventLinePrefix 计算 isCompleted）
      checked: item.checked || [],
      unchecked: item.unchecked || [],
      
      // Plan 相关
      isPlan: item.isPlan,
      isTimeCalendar: item.isTimeCalendar,
      
      // 同步字段
      calendarIds: item.calendarIds,
      todoListIds: item.todoListIds, // 🆕 To Do List IDs
      source: item.source,
      syncStatus: item.syncStatus,
      externalId: item.externalId,
      fourDNoteSource: item.fourDNoteSource,
      
      // 时间戳
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      
      // ✅ Snapshot 模式：已删除标记（仅用于 Slate 显示，executeBatchUpdate 会过滤）
      _isDeleted: item._isDeleted,
      _deletedAt: item._deletedAt,
      
      // 🔥 EventTree 字段（用于 serialization 读取）
      parentEventId: item.parentEventId,
      
      // 🔥 Position 和 BulletLevel（用于排序和层级显示）
      bulletLevel: item.bulletLevel,
      position: item.position,
    } as any;
    
    // Title 行（始终创建，即使内容为空）
    // ✅ v2.14: 使用 title.fullTitle（完整的 Slate Document 格式）
    const titleChildren: (TextNode | TagNode | DateMentionNode)[] = 
      item.title?.fullTitle 
        ? JSON.parse(item.title.fullTitle)[0]?.children || [{ text: '' }]
        : [{ text: '' }];
    
    const titleNode: EventLineNode = {
      type: 'event-line',
      eventId: item.eventId || item.id,
      lineId: item.id,
      level: (item as any).bulletLevel ?? 0, // 🔥 使用 bulletLevel（从 EventTree 计算，PlanManager 已设置）
      mode: 'title',
      children: [
        {
          type: 'paragraph',
          children: titleChildren,
        },
      ],
      metadata,  // 🆕 透传元数据
    };
    nodes.push(titleNode);
    
    // EventLog 行（只有 eventlog 字段存在且不为空时才创建）
    // 🆕 v2.0: 优先从 EventLog.slateJson 读取，回退到 HTML（兼容旧数据）
    let eventlogParagraphs: any[] = [];
    
    if (item.eventlog) {
      if (typeof item.eventlog === 'object' && item.eventlog !== null) {
        // 新格式：EventLog 对象
        if (item.eventlog.slateJson) {
          try {
            eventlogParagraphs = JSON.parse(item.eventlog.slateJson);
            
            // 🔥 FIX: 过滤掉空的paragraph（只有空text的paragraph）
            eventlogParagraphs = eventlogParagraphs.filter((para: any) => {
              if (para.type !== 'paragraph') return true;
              const children = para.children || [];
              return children.some((child: any) => child.text && child.text.trim() !== '');
            });
          } catch (err) {
            console.warn('[planItemsToSlateNodes] 无法解析 slateJson，回退到 HTML:', err);
            // 回退到 HTML
            const html = item.eventlog.html || item.eventlog.plainText || '';
            if (html) {
              const paragraphsWithLevel = parseHtmlToParagraphsWithLevel(html);
              eventlogParagraphs = paragraphsWithLevel.map(pwl => ({
                type: 'paragraph',
                children: pwl.paragraph.children,
              }));
            }
          }
        } else {
          // 只有 HTML，没有 slateJson
          const html = item.eventlog.html || item.eventlog.plainText || '';
          if (html) {
            const paragraphsWithLevel = parseHtmlToParagraphsWithLevel(html);
            eventlogParagraphs = paragraphsWithLevel.map(pwl => ({
              type: 'paragraph',
              children: pwl.paragraph.children,
            }));
          }
        }
      } else {
        // 旧格式：字符串（HTML）
        const paragraphsWithLevel = parseHtmlToParagraphsWithLevel(item.eventlog);
        eventlogParagraphs = paragraphsWithLevel.map(pwl => ({
          type: 'paragraph',
          children: pwl.paragraph.children,
        }));
      }
    }
    
    // 为每个段落创建独立的 EventLineNode
    if (eventlogParagraphs.length > 0) {
      let lineIndex = 0;
      eventlogParagraphs.forEach((para, index) => {
        const descNode: EventLineNode = {
          type: 'event-line',
          eventId: item.eventId || item.id,
          lineId: index === 0 ? `${item.id}-desc` : `${item.id}-desc-${Date.now()}-${lineIndex++}`,
          level: item.level || 0,
          mode: 'eventlog',
          children: [para],
          metadata,  // 🆕 透传元数据（eventlog 行共享 metadata）
        };
        nodes.push(descNode);
      });
    }
  });
  
  // ✅ v1.5: 如果没有节点，创建一个临时空节点（供 Slate 编辑器使用）
  // 但在 slateNodesToPlanItems 转换时会被过滤掉
  if (nodes.length === 0) {
    nodes.push(createEmptyEventLine(0, undefined, undefined));
  }
  
  return nodes;
}

/**
 * 将 HTML 转换为 Slate fragment
 */
function htmlToSlateFragment(html: string): (TextNode | TagNode | DateMentionNode)[] {
  if (!html) return [{ text: '' }];
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const fragment: (TextNode | TagNode | DateMentionNode)[] = [];
  
  // 🆕 辅助函数：从 style 属性中提取颜色值
  function extractColorFromStyle(styleStr: string, property: 'color' | 'background-color'): string | undefined {
    if (!styleStr) return undefined;
    const regex = property === 'color' 
      ? /color:\s*([^;]+)/i
      : /background-color:\s*([^;]+)/i;
    const match = styleStr.match(regex);
    return match ? match[1].trim() : undefined;
  }
  
  function processNode(node: Node, inheritedMarks: Partial<TextNode> = {}): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) {
        fragment.push({ text, ...inheritedMarks });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      
      // Tag 元素
      if (element.hasAttribute('data-tag-id')) {
        fragment.push({
          type: 'tag',
          tagId: element.getAttribute('data-tag-id') || '',
          tagName: element.getAttribute('data-tag-name') || '',
          tagColor: element.getAttribute('data-tag-color') || undefined,
          tagEmoji: element.getAttribute('data-tag-emoji') || undefined,
          mentionOnly: element.hasAttribute('data-mention-only'),
          children: [{ text: '' }],
        });
      }
      // DateMention 元素 - 🔧 同时检查 data-type 和 data-start-date
      else if (element.getAttribute('data-type') === 'dateMention' || element.hasAttribute('data-start-date')) {
        const startDate = element.getAttribute('data-start-date') || '';
        if (startDate) {
          fragment.push({
            type: 'dateMention',
            startDate: startDate,
            endDate: element.getAttribute('data-end-date') || undefined,
            eventId: element.getAttribute('data-event-id') || undefined,  // 🆕 恢复 eventId
            originalText: element.getAttribute('data-original-text') || undefined,  // 🆕 恢复原始输入
            isOutdated: element.getAttribute('data-is-outdated') === 'true',  // 🆕 恢复过期状态
            mentionOnly: element.hasAttribute('data-mention-only'),
            children: [{ text: '' }],
          });
        } else {
          // data-type="dateMention" 但缺少 data-start-date，记录警告
          console.warn('[htmlToSlateFragment] DateMention 缺少 data-start-date 属性', {
            html: element.outerHTML
          });
          // 降级为普通文本
          fragment.push({ text: element.textContent || '' });
        }
      }
      // 🆕 格式化文本 - 支持嵌套标记
      else {
        const newMarks = { ...inheritedMarks };
        
        // 解析标记
        if (element.tagName === 'STRONG' || element.tagName === 'B') {
          newMarks.bold = true;
        } else if (element.tagName === 'EM' || element.tagName === 'I') {
          newMarks.italic = true;
        } else if (element.tagName === 'U') {
          newMarks.underline = true;
        } else if (element.tagName === 'S' || element.tagName === 'STRIKE') {
          newMarks.strikethrough = true;
        }
        
        // 🆕 解析 <span style="..."> 中的颜色
        if (element.tagName === 'SPAN' && element.hasAttribute('style')) {
          const styleStr = element.getAttribute('style') || '';
          const color = extractColorFromStyle(styleStr, 'color');
          const backgroundColor = extractColorFromStyle(styleStr, 'background-color');
          
          if (color) newMarks.color = color;
          if (backgroundColor) newMarks.backgroundColor = backgroundColor;
        }
        
        // 递归处理子节点，继承标记
        element.childNodes.forEach(child => processNode(child, newMarks));
      }
    }
  }
  
  tempDiv.childNodes.forEach(node => processNode(node));
  
  return fragment.length > 0 ? fragment : [{ text: '' }];
}

/**
 * 🆕 v1.8.3: 解析 HTML 字符串，同时提取 paragraph 和 level 信息
 */
function parseHtmlToParagraphsWithLevel(html: string): Array<{ paragraph: ParagraphNode; level: number }> {
  if (!html) return [];
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const result: Array<{ paragraph: ParagraphNode; level: number }> = [];
  
  // 查找所有 <p> 标签
  const pElements = tempDiv.querySelectorAll('p');
  
  if (pElements.length === 0) {
    // 如果没有 <p> 标签，整个内容作为一个段落，level = 0
    return [{
      paragraph: {
        type: 'paragraph',
        children: htmlToSlateFragment(html),
      },
      level: 0,
    }];
  }
  
  pElements.forEach((pElement, idx) => {
    const bullet = pElement.getAttribute('data-bullet') === 'true';
    const bulletLevel = parseInt(pElement.getAttribute('data-bullet-level') || '0', 10);
    const level = parseInt(pElement.getAttribute('data-level') || '0', 10);
    
    // 🐛 调试日志：检查解析到的 bullet 属性
    if (bullet) {
      console.log(`[Deserialization] Paragraph ${idx} parsed as bullet:`, { bullet, bulletLevel, level, html: pElement.outerHTML.substring(0, 100) });
    }
    
    const para: ParagraphNode = {
      type: 'paragraph',
      children: htmlToSlateFragment(pElement.innerHTML),
    };
    
    if (bullet) {
      (para as any).bullet = true;
      (para as any).bulletLevel = bulletLevel;
    }
    
    result.push({ paragraph: para, level });
  });
  
  return result;
}

/**
 * 🆕 将 HTML 转换为多个 Paragraph 节点（包括 bullet 属性）
 */
function parseHtmlToParagraphs(html: string): ParagraphNode[] {
  if (!html) return [];
  
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const paragraphs: ParagraphNode[] = [];
  
  // 查找所有 <p> 标签
  const pElements = tempDiv.querySelectorAll('p');
  
  if (pElements.length === 0) {
    // 如果没有 <p> 标签，整个内容作为一个段落
    return [{
      type: 'paragraph',
      children: htmlToSlateFragment(html),
    }];
  }
  
  pElements.forEach(pElement => {
    const bullet = pElement.getAttribute('data-bullet') === 'true';
    const bulletLevel = parseInt(pElement.getAttribute('data-bullet-level') || '0', 10);
    
    const para: ParagraphNode = {
      type: 'paragraph',
      children: htmlToSlateFragment(pElement.innerHTML),
    };
    
    if (bullet) {
      (para as any).bullet = true;
      (para as any).bulletLevel = bulletLevel;
    }
    
    paragraphs.push(para);
  });
  
  return paragraphs;
}

/**
 * 创建空的 EventLine 节点
 * 🆕 v2.17: 直接使用 UUID 生成事件ID（无需池管理）
 * @param level 层级
 * @param parentEventId 父事件ID
 * @param position 位置权重
 */
export function createEmptyEventLine(level: number = 0, parentEventId?: string, position?: number): EventLineNode {
  // 🔥 FIX: Enter键应该创建placeholder，不是真实事件！
  // 只有当用户输入内容后，onChange才会给它分配真实的eventId
  
  return {
    type: 'event-line',
    lineId: '__placeholder__', // 🔥 临时ID，标记为placeholder
    eventId: '__placeholder__', // 🔥 临时ID
    level,
    mode: 'title',
    children: [
      {
        type: 'paragraph',
        children: [{ text: '' }],
      },
    ],
    metadata: {
      isPlaceholder: true,        // 🔥 标记为placeholder
      checkType: 'once',          // 新建事件默认显示 checkbox
      bulletLevel: level,         // 同步 bulletLevel 到 metadata
      parentEventId,              // 传入父事件ID
      position,                   // 传入位置权重
    },
  };
}

// ==================== Slate 节点 → PlanItem ====================

/**
 * 将 Slate 节点数组转换为 PlanItem 数组
 */
export function slateNodesToPlanItems(nodes: EventLineNode[]): any[] {
  const items: Map<string, any> = new Map();
  
  nodes.forEach(node => {
    if (node.type !== 'event-line') return;
    
    // 🔧 FIX: 使用 eventId 作为分组依据，而不是 lineId
    // Description 行的 lineId 是 `${id}-desc`，但 eventId 是正确的完整 ID
    const baseId = node.eventId;
    
    if (!baseId) {
      console.warn('[slateNodesToPlanItems] Node missing eventId:', node);
      return;
    }
    
    if (!items.has(baseId)) {
      // 🆕 v1.6: 从第一个遇到的节点中提取完整 metadata
      const metadata = node.metadata || {};
      
      // 🔍 DEBUG: 检查 EventTree 字段
      if (metadata.parentEventId) {
        // console.log('[Serialization] 🔍 Reading EventTree from metadata:', {
        //   baseId: baseId.slice(-8),
        //   parentEventId: metadata.parentEventId ? metadata.parentEventId.slice(-8) : metadata.parentEventId,
        //   parentEventIdFull: metadata.parentEventId,  // 🆕 显示完整ID
        //   parentEventIdLength: metadata.parentEventId?.length,  // 🆕 显示长度
        //   hasMetadata: !!node.metadata,
        //   metadataKeys: Object.keys(metadata)
        // });
      }
      
      // 🔥 [FIX] 过滤无效的 parentEventId
      // bulletLevel === 0 的顶级事件不应该有父事件
      // 🆕 v2.16: 不再过滤 line- 开头的ID（池化ID是真实ID）
      if (metadata.parentEventId) {
        const bulletLevel = metadata.bulletLevel ?? node.level ?? 0;
        
        if (bulletLevel === 0) {
          console.warn('[Serialization] ⚠️ Level 0 event should not have parent，已清除:', {
            eventId: baseId.slice(-8),
            invalidParentId: metadata.parentEventId,
            bulletLevel: 0,
            action: '顶级事件不应该有父事件'
          });
          metadata.parentEventId = undefined;
        }
      }
      
      items.set(baseId, {
        id: baseId,
        eventId: node.eventId,
        level: node.level,
        title: '',
        content: '',
        description: '',
        tags: [],
        
        // ✅ v1.8: 反序列化时保留 undefined（不使用 ?? undefined）
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        dueDate: metadata.dueDate,
        // Field contract: isAllDay 必须保持可选；不要默认注入 false
        isAllDay: metadata.isAllDay,
        timeSpec: metadata.timeSpec,
        
        emoji: metadata.emoji,
        color: metadata.color,
        
        priority: metadata.priority || 'medium',
        isCompleted: metadata.isCompleted || false,
        isTask: metadata.isTask ?? true,
        type: metadata.type || 'todo',
        checkType: metadata.checkType, // ✅ 不添加默认值，保持原样
        
        isPlan: metadata.isPlan, // ✅ 不添加默认值
        isTimeCalendar: metadata.isTimeCalendar,
        
        // 🔥 EventTree 字段 - 从 metadata 读取（Tab 键更新的）
        parentEventId: metadata.parentEventId,
        
        // 🔥 Position 和 BulletLevel - 从 metadata 读取
        bulletLevel: metadata.bulletLevel ?? 0,
        position: metadata.position,
        
        calendarIds: metadata.calendarIds || [],
        todoListIds: metadata.todoListIds || [], // 🆕 To Do List IDs
        source: metadata.source || 'local',
        syncStatus: metadata.syncStatus || 'local-only',
        externalId: metadata.externalId,
        fourDNoteSource: metadata.fourDNoteSource ?? true,
        
        createdAt: metadata.createdAt,
        updatedAt: metadata.updatedAt,
      });
    }
    
    const item = items.get(baseId)!;
    
    // 🔧 安全检查:确保节点结构正确，但不要跳过节点，只是使用安全的默认值
    const paragraphs = node.children || [];
    
    if (node.mode === 'title') {
      // Title 模式：只取第一个 paragraph
      const firstParagraph = paragraphs[0];
      const fragment = firstParagraph?.children;
      
      // ✅ v2.14: 保存到 title 对象（三层架构）
      // fullTitle 保存 Slate JSON（JSON.stringify），EventService 会自动生成 colorTitle 和 simpleTitle
      // 🔥 FIX: 只传 fullTitle，不要传 colorTitle/simpleTitle（即使是 undefined）
      //         这样 normalizeTitle 的场景1判断 (!colorTitle && !simpleTitle) 才能正确触发
      
      // 🔍 DEBUG: 检查 fragment 中的 tag 节点
      if (fragment && fragment.some((n: any) => n.type === 'tag')) {
        console.log('[Serialization] 保存包含 tag 的 fragment:', JSON.stringify(fragment, null, 2));
      }
      
      // 🔧 FIX: fullTitle 应该是完整的 Slate Document（包含 paragraph），而不是 fragment
      // TitleSlate 需要标准的 Slate JSON 格式
      item.title = {
        fullTitle: firstParagraph ? JSON.stringify([firstParagraph]) : JSON.stringify([{ type: 'paragraph', children: [{ text: '' }] }])
      };
      item.tags = fragment ? extractTags(fragment) : '';
      
      // 🆕 v2.9: 优先从 TimeHub 读取最新时间（DateMention 只是触发器）
      const timeSnapshot = TimeHub.getSnapshot(baseId);
      if (timeSnapshot.start || timeSnapshot.end !== undefined) {
        // TimeHub 有数据，使用 TimeHub 的时间（最新）
        item.startTime = timeSnapshot.start || null;
        item.endTime = timeSnapshot.end !== undefined ? timeSnapshot.end : null;  // 🔧 使用 null 而非 undefined
      } else if (fragment) {
        // TimeHub 无数据，尝试从 DateMention 读取（向后兼容）
        const dateMention = fragment.find((n): n is DateMentionNode => 
          'type' in n && n.type === 'dateMention'
        );
        if (dateMention) {
          item.startTime = dateMention.startDate;
          item.endTime = dateMention.endDate || null;
        }
      }
    } else {
      // 🆕 v2.0: Eventlog 模式：保存为 Slate JSON（而不是 HTML）
      // 🔧 累积所有 eventlog 段落的 Slate 节点
      if (!item.eventlogSlateNodes) {
        item.eventlogSlateNodes = [];
      }
      
      // console.log(`[💾 Serialization] EventLog 段落累积 - Event: ${baseId.slice(-10)}`, {
      //   已累积: item.eventlogSlateNodes.length,
      //   新增段落数: paragraphs.length,
      //   lineId: node.lineId,
      //   mode: node.mode
      // });
      
      paragraphs.forEach((para, idx) => {
        // 保留完整的段落节点（包括 bullet、bulletLevel 等属性）
        const paragraphNode = {
          type: 'paragraph',
          bullet: (para as any).bullet,
          bulletLevel: (para as any).bulletLevel || 0,
          children: para.children || [{ text: '' }],
        };
        
        item.eventlogSlateNodes!.push(paragraphNode);
      });
      
      // 🔧 同时保存纯文本到 description（用于搜索和同步）
      const linePlainText = paragraphs.map(para => {
        const fragment = para.children || [];
        return extractPlainText(fragment);
      }).join('\n');
      
      item.description = (item.description || '') + (item.description ? '\n' : '') + linePlainText;
    }
  });
  
  // 🔧 v2.0: 将累积的 eventlogSlateNodes 转换为 EventLog 对象
  items.forEach(item => {
    if (item.eventlogSlateNodes && item.eventlogSlateNodes.length > 0) {
      const slateJson = JSON.stringify(item.eventlogSlateNodes);
      const html = item.eventlogSlateNodes.map((para: any) => {
        const fragment = para.children || [];
        const htmlContent = slateFragmentToHtml(fragment);
        if (para.bullet) {
          return `<p data-bullet="true" data-bullet-level="${para.bulletLevel || 0}">${htmlContent}</p>`;
        } else {
          return `<p>${htmlContent}</p>`;
        }
      }).join('');
      
      // console.log(`[✅ Serialization] EventLog 对象生成 - Event: ${item.id || 'unknown'}`, {
      //   段落数: item.eventlogSlateNodes.length,
      //   slateJsonLength: slateJson.length,
      //   htmlLength: html.length,
      //   plainTextLength: (item.description || '').length,
      //   slateJsonPreview: slateJson.substring(0, 100)
      // });
      
      item.eventlog = {
        slateJson,
        html,
        plainText: item.description || '',
      };
      
      // 清理临时字段
      delete (item as any).eventlogSlateNodes;
    } else if (item.eventlogSlateNodes && item.eventlogSlateNodes.length === 0) {
      // console.log(`[⚠️ Serialization] EventLog 为空 - Event: ${item.id || 'unknown'}`);
      // 清空 eventlog
      item.eventlog = undefined;
      delete (item as any).eventlogSlateNodes;
    }
  });
  
  // ✅ v1.5: 过滤掉空节点（临时占位节点）
  const result = Array.from(items.values()).filter(item => {
    // 🔥 过滤占位符节点（ID 以 placeholder- 开头或等于 __placeholder__）
    if (item.id?.startsWith('placeholder-') || item.eventId?.startsWith('placeholder-') ||
        item.id === '__placeholder__' || item.eventId === '__placeholder__') {
      console.log('[slateNodesToPlanItems] 🗑️ 过滤占位符:', item.id?.slice(-8));
      return false;
    }
    
    // 🔥 FIX: 检查 fullTitle 而不是 simpleTitle（因为 simpleTitle 在这里可能是 undefined）
    // 需要解析 fullTitle JSON 来检查是否真的有内容
    let hasRealTitle = false;
    if (item.title?.fullTitle) {
      try {
        const titleSlate = JSON.parse(item.title.fullTitle);
        // 检查是否有非空文本节点
        hasRealTitle = titleSlate.some((para: any) => {
          const children = para.children || [];
          return children.some((child: any) => {
            return child.text && child.text.trim() !== '';
          });
        });
      } catch (e) {
        // 解析失败，按字符串检查
        hasRealTitle = !!item.title.fullTitle.trim();
      }
    } else if (item.title?.simpleTitle || item.title?.colorTitle) {
      hasRealTitle = !!(item.title.simpleTitle?.trim() || item.title.colorTitle?.trim());
    }
    
    // 🔧 修复: eventlog 现在是对象，需要检查实际文本内容
    let hasEventlog = false;
    if (item.eventlog && typeof item.eventlog === 'object') {
      // 检查slateJson是否有实际文本内容
      if (item.eventlog.slateJson) {
        try {
          const slateNodes = JSON.parse(item.eventlog.slateJson);
          hasEventlog = slateNodes.some((para: any) => {
            const children = para.children || [];
            return children.some((child: any) => child.text && child.text.trim() !== '');
          });
        } catch (e) {
          hasEventlog = false;
        }
      }
      // 如果slateJson没有内容，检查plainText
      if (!hasEventlog && item.eventlog.plainText) {
        hasEventlog = !!item.eventlog.plainText.trim();
      }
    } else if (item.eventlog && typeof item.eventlog === 'string') {
      hasEventlog = !!item.eventlog.trim();
    }
    
    const isEmpty = !hasRealTitle && 
                   !item.content?.trim() && 
                   !item.description?.trim() &&
                   !hasEventlog && // 🆕 使用修复后的检查
                   (!item.tags || item.tags.length === 0) &&
                   // 🔥 FIX: 不要因为有这些默认字段就认为不是空的
                   !item.startTime &&  // 没有真实时间
                   !item.endTime &&
                   !item.dueDate;
    
    if (isEmpty) {
      console.log('[slateNodesToPlanItems] 🗑️ 过滤空事件:', {
        id: item.id?.slice(-8),
        fullId: item.id,
        titleFullTitle: item.title?.fullTitle?.slice(0, 100),
        hasRealTitle,
        hasContent: !!item.content?.trim(),
        hasDescription: !!item.description?.trim(),
        hasEventlog,
        hasTags: item.tags && item.tags.length > 0,
        hasStartTime: !!item.startTime,
        hasEndTime: !!item.endTime,
        hasDueDate: !!item.dueDate,
        checkType: item.checkType,
        完整item: JSON.stringify(item).slice(0, 500)
      });
    }
    
    return !isEmpty;  // 只保留非空节点
  });
  
  console.log('[slateNodesToPlanItems] 📊 过滤结果:', {
    原始数量: items.size,
    过滤后数量: result.length,
    过滤掉: items.size - result.length
  });
  
  return result;
}

/**
 * 将 Slate fragment 转换为 HTML
 */
function slateFragmentToHtml(fragment: (TextNode | TagNode | DateMentionNode)[]): string {
  // 🔧 安全检查：如果 fragment 为 undefined 或 null，返回空字符串
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[slateFragmentToHtml] fragment 不是数组', { fragment });
    return '';
  }
  
  return fragment.map(node => {
    if ('text' in node) {
      let text = node.text;
      if (node.bold) text = `<strong>${text}</strong>`;
      if (node.italic) text = `<em>${text}</em>`;
      if (node.underline) text = `<u>${text}</u>`;
      if (node.strikethrough) text = `<s>${text}</s>`;
      
      // 🆕 支持文字颜色和背景色
      if (node.color || node.backgroundColor) {
        const styles = [];
        if (node.color) styles.push(`color: ${node.color}`);
        if (node.backgroundColor) styles.push(`background-color: ${node.backgroundColor}`);
        text = `<span style="${styles.join('; ')}">${text}</span>`;
      }
      
      return text;
    } else if (node.type === 'tag') {
      const attrs = [
        `data-type="tag"`,
        `data-tag-id="${node.tagId}"`,
        `data-tag-name="${node.tagName}"`,
        node.tagColor ? `data-tag-color="${node.tagColor}"` : '',
        node.tagEmoji ? `data-tag-emoji="${node.tagEmoji}"` : '',
        node.mentionOnly ? `data-mention-only="true"` : '',
      ].filter(Boolean).join(' ');
      
      const emoji = node.tagEmoji ? node.tagEmoji + ' ' : '';
      return `<span ${attrs} contenteditable="false" class="inline-tag">${emoji}${node.tagName}</span>`;
    } else if (node.type === 'dateMention') {
      const attrs = [
        `data-type="dateMention"`,
        `data-start-date="${node.startDate}"`,
        node.endDate ? `data-end-date="${node.endDate}"` : '',
        node.eventId ? `data-event-id="${node.eventId}"` : '',  // 🆕 保存 eventId
        node.originalText ? `data-original-text="${node.originalText}"` : '',  // 🆕 保存原始输入
        node.isOutdated ? `data-is-outdated="true"` : '',  // 🆕 保存过期状态
        node.mentionOnly ? `data-mention-only="true"` : '',
      ].filter(Boolean).join(' ');
      
      const startDate = new Date(node.startDate);
      const endDate = node.endDate ? new Date(node.endDate) : null;
      const dateText = formatDateForDisplay(startDate, endDate);
      
      return `<span ${attrs} contenteditable="false" class="inline-date">📅 ${dateText}</span>`;
    }
    return '';
  }).join('');
}

/**
 * 提取纯文本
 */
function extractPlainText(fragment: (TextNode | TagNode | DateMentionNode)[]): string {
  // 🔧 安全检查
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[extractPlainText] fragment 不是数组', { fragment });
    return '';
  }
  
  return fragment.map(node => {
    if ('text' in node) return node.text;
    if (node.type === 'tag') return `#${node.tagName}`;
    if (node.type === 'dateMention') {
      const start = new Date(node.startDate);
      return formatDateForDisplay(start, node.endDate ? new Date(node.endDate) : null);
    }
    return '';
  }).join('');
}

/**
 * 提取标签
 */
function extractTags(fragment: (TextNode | TagNode | DateMentionNode)[]): string[] {
  // 🔧 安全检查
  if (!fragment || !Array.isArray(fragment)) {
    console.warn('[extractTags] fragment 不是数组', { fragment });
    return [];
  }
  
  return fragment
    .filter((node): node is TagNode => 'type' in node && node.type === 'tag' && !node.mentionOnly)
    .map(node => node.tagName);
}

/**
 * 格式化日期显示
 */
function formatDateForDisplay(start: Date, end: Date | null): string {
  const formatDate = (d: Date) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${month}-${day}`;
  };
  
  if (end && end.getTime() !== start.getTime()) {
    return `${formatDate(start)} - ${formatDate(end)}`;
  }
  return formatDate(start);
}

// ==================== HTML 复制增强 ====================

/**
 * 将 Slate 节点转换为富文本 HTML（用于跨应用复制）
 */
export function slateNodesToRichHtml(nodes: EventLineNode[]): string {
  const eventLines = nodes;
  
  // 按 level 构建嵌套列表
  const html: string[] = ['<ul style="list-style-type: disc; padding-left: 20px;">'];
  
  eventLines.forEach(node => {
    if (node.type !== 'event-line') return;
    
    const indent = '  '.repeat(node.level);
    const content = slateFragmentToRichHtml(node.children[0].children);
    const style = node.mode === 'eventlog' ? ' style="color: #666; font-size: 0.9em;"' : '';
    
    html.push(`${indent}<li${style}>${content}</li>`);
  });
  
  html.push('</ul>');
  
  return html.join('\n');
}

/**
 * 将 Slate fragment 转换为富文本 HTML
 */
function slateFragmentToRichHtml(fragment: (TextNode | TagNode | DateMentionNode)[]): string {
  return fragment.map(node => {
    if ('text' in node) {
      let text = node.text || '';
      if (node.bold) text = `<strong>${text}</strong>`;
      if (node.italic) text = `<em>${text}</em>`;
      if (node.underline) text = `<u>${text}</u>`;
      if (node.strikethrough) text = `<s>${text}</s>`;
      if (node.color) text = `<span style="color: ${node.color}">${text}</span>`;
      return text;
    } else if (node.type === 'tag') {
      const emoji = node.tagEmoji ? node.tagEmoji + ' ' : '';
      return `<span style="display: inline-block; padding: 2px 6px; background: ${node.tagColor || '#e5e7eb'}; border-radius: 4px; font-size: 0.85em;">${emoji}#${node.tagName}</span>`;
    } else if (node.type === 'dateMention') {
      const start = new Date(node.startDate);
      const end = node.endDate ? new Date(node.endDate) : null;
      const dateText = formatDateForDisplay(start, end);
      return `<span style="display: inline-block; padding: 2px 6px; background: #dbeafe; border-radius: 4px; font-size: 0.85em;">📅 ${dateText}</span>`;
    }
    return '';
  }).join('');
}

// ==================== HTML 粘贴解析 ====================

/**
 * 从外部 HTML 解析为 Slate 节点（智能识别缩进和日期）
 */
export function parseExternalHtml(html: string): EventLineNode[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const nodes: EventLineNode[] = [];
  
  // 递归处理列表
  function processList(ul: HTMLElement, level: number = 0): void {
    const items = ul.querySelectorAll(':scope > li');
    items.forEach(li => {
      const content = li.innerHTML;
      const lineId = `line-${Date.now()}-${Math.random()}`;
      
      nodes.push({
        type: 'event-line',
        lineId,
        level,
        mode: 'title',
        children: [
          {
            type: 'paragraph',
            children: parseHtmlFragment(content),
          },
        ],
      });
      
      // 处理嵌套列表
      const nestedUl = li.querySelector(':scope > ul');
      if (nestedUl) {
        processList(nestedUl as HTMLElement, level + 1);
      }
    });
  }
  
  // 查找列表
  const ul = tempDiv.querySelector('ul');
  if (ul) {
    processList(ul);
  } else {
    // 没有列表，处理段落
    const paragraphs = tempDiv.querySelectorAll('p');
    if (paragraphs.length > 0) {
      paragraphs.forEach(p => {
        nodes.push({
          type: 'event-line',
          lineId: `line-${Date.now()}-${Math.random()}`,
          level: 0,
          mode: 'title',
          children: [
            {
              type: 'paragraph',
              children: parseHtmlFragment(p.innerHTML),
            },
          ],
        });
      });
    } else {
      // 纯文本
      nodes.push({
        type: 'event-line',
        lineId: `line-${Date.now()}-${Math.random()}`,
        level: 0,
        mode: 'title',
        children: [
          {
            type: 'paragraph',
            children: parseHtmlFragment(tempDiv.innerHTML),
          },
        ],
      });
    }
  }
  
  return nodes.length > 0 ? nodes : [createEmptyEventLine()];
}

/**
 * 解析 HTML fragment（保留格式，智能识别日期）
 */
function parseHtmlFragment(html: string): (TextNode | TagNode | DateMentionNode)[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  const fragment: (TextNode | TagNode | DateMentionNode)[] = [];
  
  function processNode(node: Node, formats: Partial<TextNode> = {}): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text.trim()) {
        // 尝试智能识别日期
        const dateMatch = text.match(/(\d{4}[-/]\d{1,2}[-/]\d{1,2})/);
        if (dateMatch) {
          const beforeDate = text.substring(0, dateMatch.index);
          const dateStr = dateMatch[1];
          const afterDate = text.substring(dateMatch.index! + dateStr.length);
          
          if (beforeDate) fragment.push({ text: beforeDate, ...formats });
          
          fragment.push({
            type: 'dateMention',
            startDate: formatTimeForStorage(new Date(dateStr)),
            children: [{ text: '' }],
          });
          
          if (afterDate) fragment.push({ text: afterDate, ...formats });
        } else {
          fragment.push({ text, ...formats });
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as HTMLElement;
      
      // 处理自定义元素（tag、dateMention）
      if (element.tagName === 'SPAN' && element.dataset.type === 'tag') {
        fragment.push({
          type: 'tag',
          tagId: element.dataset.tagId || '',
          tagName: element.dataset.tagName || element.textContent?.replace(/^#/, '') || '',
          tagColor: element.dataset.tagColor,
          tagEmoji: element.dataset.tagEmoji,
          mentionOnly: element.dataset.mentionOnly === 'true',
          children: [{ text: '' }],
        });
        return;
      }
      
      if (element.tagName === 'SPAN' && element.dataset.type === 'dateMention') {
        fragment.push({
          type: 'dateMention',
          startDate: element.dataset.startDate || '',
          endDate: element.dataset.endDate,
          eventId: element.dataset.eventId,
          mentionOnly: element.dataset.mentionOnly === 'true',
          children: [{ text: '' }],
        });
        return;
      }
      
      // 处理格式标签
      const newFormats = { ...formats };
      
      if (element.tagName === 'STRONG' || element.tagName === 'B') {
        newFormats.bold = true;
      } else if (element.tagName === 'EM' || element.tagName === 'I') {
        newFormats.italic = true;
      } else if (element.tagName === 'U') {
        newFormats.underline = true;
      } else if (element.tagName === 'S' || element.tagName === 'DEL') {
        newFormats.strikethrough = true;
      }
      
      element.childNodes.forEach(child => processNode(child, newFormats));
    }
  }
  
  tempDiv.childNodes.forEach(node => processNode(node));
  
  return fragment.length > 0 ? fragment : [{ text: '' }];
}
