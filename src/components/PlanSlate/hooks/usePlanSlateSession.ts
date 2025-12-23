/**
 * PlanSlate 会话态管理 (v2.21.0)
 * 
 * 统一管理编辑器会话状态，避免散落的useState + 成组变化时的一致性问题
 * 
 * 职责：
 * - Mention/Search UI状态（打开/关闭/类型/查询）
 * - Cursor Intent（键盘操作后的光标恢复意图）
 * - Flush Policy（何时触发保存：高优先级 vs debounce）
 * 
 * 设计原则：
 * - 一次用户动作改变多个字段 → 放reducer（原子更新）
 * - 命令式副作用（focus/select）→ 由effect消费cursorIntent
 * - 不放这里：DOMRect/timers/Slate实例（应该用useRef）
 */

import { useReducer, useCallback } from 'react';

// ======================== State Types ========================

export interface MentionSession {
  isOpen: boolean;
  type: 'time' | 'search' | null;
  query: string;
  anchor: HTMLElement | null;
  initialStart?: Date;
  initialEnd?: Date;
}

export interface SearchSession {
  isOpen: boolean;
  query: string;
}

export interface CursorIntent {
  type: 'restore' | 'focus' | null;
  path?: number[]; // Slate Path
  offset?: number;
}

export interface FlushRequest {
  priority: 'high' | 'normal'; // high=立即flush, normal=debounce
  timestamp: number;
}

export interface PlanSlateSessionState {
  mention: MentionSession;
  search: SearchSession;
  cursorIntent: CursorIntent;
  flushRequest: FlushRequest | null;
}

// ======================== Action Types ========================

export type PlanSlateSessionAction =
  | { type: 'OPEN_MENTION'; payload: { mentionType: 'time' | 'search'; anchor: HTMLElement; initialStart?: Date; initialEnd?: Date } }
  | { type: 'UPDATE_MENTION_QUERY'; payload: string }
  | { type: 'CLOSE_MENTION' }
  | { type: 'OPEN_SEARCH'; payload: string }
  | { type: 'UPDATE_SEARCH_QUERY'; payload: string }
  | { type: 'CLOSE_SEARCH' }
  | { type: 'SET_CURSOR_INTENT'; payload: CursorIntent }
  | { type: 'CLEAR_CURSOR_INTENT' }
  | { type: 'REQUEST_FLUSH'; payload: { priority: 'high' | 'normal' } }
  | { type: 'CLEAR_FLUSH_REQUEST' };

// ======================== Initial State ========================

const initialState: PlanSlateSessionState = {
  mention: {
    isOpen: false,
    type: null,
    query: '',
    anchor: null,
  },
  search: {
    isOpen: false,
    query: '',
  },
  cursorIntent: {
    type: null,
  },
  flushRequest: null,
};

// ======================== Reducer ========================

function planSlateSessionReducer(
  state: PlanSlateSessionState,
  action: PlanSlateSessionAction
): PlanSlateSessionState {
  switch (action.type) {
    // ===== Mention Session =====
    case 'OPEN_MENTION':
      return {
        ...state,
        mention: {
          isOpen: true,
          type: action.payload.mentionType,
          query: '',
          anchor: action.payload.anchor,
          initialStart: action.payload.initialStart,
          initialEnd: action.payload.initialEnd,
        },
      };

    case 'UPDATE_MENTION_QUERY':
      return {
        ...state,
        mention: {
          ...state.mention,
          query: action.payload,
        },
      };

    case 'CLOSE_MENTION':
      return {
        ...state,
        mention: {
          isOpen: false,
          type: null,
          query: '',
          anchor: null,
          initialStart: undefined,
          initialEnd: undefined,
        },
      };

    // ===== Search Session =====
    case 'OPEN_SEARCH':
      return {
        ...state,
        search: {
          isOpen: true,
          query: action.payload,
        },
      };

    case 'UPDATE_SEARCH_QUERY':
      return {
        ...state,
        search: {
          ...state.search,
          query: action.payload,
        },
      };

    case 'CLOSE_SEARCH':
      return {
        ...state,
        search: {
          isOpen: false,
          query: '',
        },
      };

    // ===== Cursor Intent =====
    case 'SET_CURSOR_INTENT':
      return {
        ...state,
        cursorIntent: action.payload,
      };

    case 'CLEAR_CURSOR_INTENT':
      return {
        ...state,
        cursorIntent: { type: null },
      };

    // ===== Flush Request =====
    case 'REQUEST_FLUSH':
      return {
        ...state,
        flushRequest: {
          priority: action.payload.priority,
          timestamp: Date.now(),
        },
      };

    case 'CLEAR_FLUSH_REQUEST':
      return {
        ...state,
        flushRequest: null,
      };

    default:
      return state;
  }
}

// ======================== Hook ========================

export function usePlanSlateSession() {
  const [state, dispatch] = useReducer(planSlateSessionReducer, initialState);

  // ===== Mention Actions =====
  const openMention = useCallback(
    (mentionType: 'time' | 'search', anchor: HTMLElement, initialStart?: Date, initialEnd?: Date) => {
      dispatch({ type: 'OPEN_MENTION', payload: { mentionType, anchor, initialStart, initialEnd } });
    },
    []
  );

  const updateMentionQuery = useCallback((query: string) => {
    dispatch({ type: 'UPDATE_MENTION_QUERY', payload: query });
  }, []);

  const closeMention = useCallback(() => {
    dispatch({ type: 'CLOSE_MENTION' });
  }, []);

  // ===== Search Actions =====
  const openSearch = useCallback((query: string) => {
    dispatch({ type: 'OPEN_SEARCH', payload: query });
  }, []);

  const updateSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'UPDATE_SEARCH_QUERY', payload: query });
  }, []);

  const closeSearch = useCallback(() => {
    dispatch({ type: 'CLOSE_SEARCH' });
  }, []);

  // ===== Cursor Intent Actions =====
  const setCursorIntent = useCallback((intent: CursorIntent) => {
    dispatch({ type: 'SET_CURSOR_INTENT', payload: intent });
  }, []);

  const clearCursorIntent = useCallback(() => {
    dispatch({ type: 'CLEAR_CURSOR_INTENT' });
  }, []);

  // ===== Flush Request Actions =====
  const requestFlush = useCallback((priority: 'high' | 'normal') => {
    dispatch({ type: 'REQUEST_FLUSH', payload: { priority } });
  }, []);

  const clearFlushRequest = useCallback(() => {
    dispatch({ type: 'CLEAR_FLUSH_REQUEST' });
  }, []);

  return {
    state,
    actions: {
      openMention,
      updateMentionQuery,
      closeMention,
      openSearch,
      updateSearchQuery,
      closeSearch,
      setCursorIntent,
      clearCursorIntent,
      requestFlush,
      clearFlushRequest,
    },
  };
}
