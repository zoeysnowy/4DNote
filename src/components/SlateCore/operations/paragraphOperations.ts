/**
 * SlateCore - 段落操作工具
 * 
 * 提供段落移动、交换等功能
 * 支持边界检查和特殊节点跳过
 * 
 * @version 1.0.0
 * @date 2025-11-29
 */

import { Editor, Transforms, Path, Node } from 'slate';
import { getSiblingPath, isValidPath, isNodeType } from './nodeOperations';

/**
 * 插入“软换行”（同一段落内换行，不创建新 paragraph 节点）
 * - 用于 TimeLog/EventLog 这类“一个段落=一个时间块”的编辑体验
 */
export function insertSoftBreak(editor: Editor): boolean {
  try {
    if (!editor.selection) return false;
    Transforms.insertText(editor, '\n');
    return true;
  } catch (err) {
    console.error('[SlateCore.insertSoftBreak] Failed:', err);
    return false;
  }
}

/**
 * 段落移动选项
 */
export interface ParagraphMoveOptions {
  skipTypes?: string[];  // 要跳过的节点类型（如 ['timestamp-divider']）
  boundaryCheck?: (path: Path) => boolean;  // 边界检查函数
}

/**
 * 向上移动段落
 * @param editor Slate Editor
 * @param currentPath 当前段落路径
 * @param options 移动选项
 * @returns true = 移动成功，false = 移动失败
 */
export function moveParagraphUp(
  editor: Editor,
  currentPath: Path,
  options?: ParagraphMoveOptions
): boolean {
  try {
    const { skipTypes = [], boundaryCheck } = options || {};
    
    console.log('[SlateCore.moveParagraphUp] 开始向上移动:', currentPath);
    
    // 检查边界
    if (boundaryCheck && !boundaryCheck(currentPath)) {
      console.log('[SlateCore.moveParagraphUp] 边界检查失败');
      return false;
    }
    
    // 查找目标位置（跳过特殊节点）
    let targetPath = getSiblingPath(currentPath, -1);
    
    while (targetPath && isValidPath(editor, targetPath)) {
      const targetNode = Node.get(editor, targetPath);
      const targetType = (targetNode as any).type;
      
      // 检查是否需要跳过
      if (skipTypes.includes(targetType)) {
        console.log('[SlateCore.moveParagraphUp] 跳过节点类型:', targetType);
        targetPath = getSiblingPath(targetPath, -1);
        continue;
      }
      
      // 找到有效目标，执行交换
      swapNodes(editor, currentPath, targetPath);
      console.log('[SlateCore.moveParagraphUp] 移动成功:', currentPath, '→', targetPath);
      return true;
    }
    
    console.log('[SlateCore.moveParagraphUp] 无法找到有效目标位置');
    return false;
  } catch (err) {
    console.error('[SlateCore.moveParagraphUp] Failed:', err);
    return false;
  }
}

/**
 * 向下移动段落
 * @param editor Slate Editor
 * @param currentPath 当前段落路径
 * @param options 移动选项
 * @returns true = 移动成功，false = 移动失败
 */
export function moveParagraphDown(
  editor: Editor,
  currentPath: Path,
  options?: ParagraphMoveOptions
): boolean {
  try {
    const { skipTypes = [], boundaryCheck } = options || {};
    
    console.log('[SlateCore.moveParagraphDown] 开始向下移动:', currentPath);
    
    // 检查边界
    if (boundaryCheck && !boundaryCheck(currentPath)) {
      console.log('[SlateCore.moveParagraphDown] 边界检查失败');
      return false;
    }
    
    // 查找目标位置（跳过特殊节点）
    let targetPath = getSiblingPath(currentPath, +1);
    
    while (targetPath && isValidPath(editor, targetPath)) {
      const targetNode = Node.get(editor, targetPath);
      const targetType = (targetNode as any).type;
      
      // 检查是否需要跳过
      if (skipTypes.includes(targetType)) {
        console.log('[SlateCore.moveParagraphDown] 跳过节点类型:', targetType);
        targetPath = getSiblingPath(targetPath, +1);
        continue;
      }
      
      // 找到有效目标，执行交换
      swapNodes(editor, currentPath, targetPath);
      console.log('[SlateCore.moveParagraphDown] 移动成功:', currentPath, '→', targetPath);
      return true;
    }
    
    console.log('[SlateCore.moveParagraphDown] 无法找到有效目标位置');
    return false;
  } catch (err) {
    console.error('[SlateCore.moveParagraphDown] Failed:', err);
    return false;
  }
}

/**
 * 交换两个节点
 * @param editor Slate Editor
 * @param pathA 节点 A 路径
 * @param pathB 节点 B 路径
 */
export function swapNodes(
  editor: Editor,
  pathA: Path,
  pathB: Path
): void {
  try {
    // 确保 pathA < pathB（路径排序）
    const [lowerPath, higherPath] = Path.isBefore(pathA, pathB) ? [pathA, pathB] : [pathB, pathA];
    
    // 获取两个节点
    const nodeA = Node.get(editor, lowerPath);
    const nodeB = Node.get(editor, higherPath);
    
    console.log('[SlateCore.swapNodes] 交换节点:', {
      lowerPath,
      higherPath,
      nodeA: (nodeA as any).type,
      nodeB: (nodeB as any).type,
    });
    
    // 先移除高位节点，再移除低位节点（避免路径变化）
    Transforms.removeNodes(editor, { at: higherPath });
    Transforms.removeNodes(editor, { at: lowerPath });
    
    // 先插入 nodeB 到低位，再插入 nodeA 到高位
    Transforms.insertNodes(editor, nodeB, { at: lowerPath });
    Transforms.insertNodes(editor, nodeA, { at: higherPath });
    
    console.log('[SlateCore.swapNodes] 交换完成');
  } catch (err) {
    console.error('[SlateCore.swapNodes] Failed:', err);
  }
}

/**
 * 检查是否可以向上移动
 * @param editor Slate Editor
 * @param currentPath 当前路径
 * @param options 移动选项
 * @returns true = 可以移动，false = 不能移动
 */
export function canMoveUp(
  editor: Editor,
  currentPath: Path,
  options?: ParagraphMoveOptions
): boolean {
  const { skipTypes = [], boundaryCheck } = options || {};
  
  // 检查边界
  if (boundaryCheck && !boundaryCheck(currentPath)) {
    return false;
  }
  
  // 查找目标位置
  let targetPath = getSiblingPath(currentPath, -1);
  
  while (targetPath && isValidPath(editor, targetPath)) {
    const targetNode = Node.get(editor, targetPath);
    const targetType = (targetNode as any).type;
    
    if (!skipTypes.includes(targetType)) {
      return true; // 找到有效目标
    }
    
    targetPath = getSiblingPath(targetPath, -1);
  }
  
  return false; // 无法找到有效目标
}

/**
 * 检查是否可以向下移动
 * @param editor Slate Editor
 * @param currentPath 当前路径
 * @param options 移动选项
 * @returns true = 可以移动，false = 不能移动
 */
export function canMoveDown(
  editor: Editor,
  currentPath: Path,
  options?: ParagraphMoveOptions
): boolean {
  const { skipTypes = [], boundaryCheck } = options || {};
  
  // 检查边界
  if (boundaryCheck && !boundaryCheck(currentPath)) {
    return false;
  }
  
  // 查找目标位置
  let targetPath = getSiblingPath(currentPath, +1);
  
  while (targetPath && isValidPath(editor, targetPath)) {
    const targetNode = Node.get(editor, targetPath);
    const targetType = (targetNode as any).type;
    
    if (!skipTypes.includes(targetType)) {
      return true; // 找到有效目标
    }
    
    targetPath = getSiblingPath(targetPath, +1);
  }
  
  return false; // 无法找到有效目标
}
