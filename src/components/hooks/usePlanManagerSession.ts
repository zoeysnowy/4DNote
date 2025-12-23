/**
 * PlanManager 会话态管理 (v2.21.0)
 * 
 * 统一管理页面会话状态，避免多个useState之间的"模式耦合"
 * 
 * 职责：
 * - Focus状态（当前聚焦行ID + 模式 + isTask + 选中标签）
 * - Filter状态（日期范围 + 激活的过滤器 + 隐藏标签 + 搜索查询）
 * - Snapshot版本（强制重新计算快照的信号）
 * 
 * 设计原则：
 * - Focus变化常伴随mode/isTask/tags变化 → 需要原子更新
 * - Filter组合改变时需要触发snapshot版本递增
 * - UI临时态（showEmojiPicker等）不放这里，继续用useState
 */

import { useReducer, useCallback } from 'react';

// ======================== State Types ========================

export interface FocusState {
  lineId: string | null;
  mode: 'title' | 'description';
  isTask: boolean;
  selectedTags: string[];
}

export interface FilterState {
  dateRange: { start: Date; end: Date } | null;
  activeFilter: 'tags' | 'tasks' | 'favorites' | 'new';
  hiddenTags: Set<string>;
  searchQuery: string;
}

export interface PlanManagerSessionState {
  focus: FocusState;
  filter: FilterState;
  snapshotVersion: number;
}

// ======================== Action Types ========================

export type PlanManagerSessionAction =
  // Focus Actions
  | { type: 'SET_FOCUS'; payload: { lineId: string | null; mode?: 'title' | 'description'; isTask?: boolean; selectedTags?: string[] } }
  | { type: 'UPDATE_FOCUS_MODE'; payload: 'title' | 'description' }
  | { type: 'UPDATE_FOCUS_TASK'; payload: boolean }
  | { type: 'UPDATE_FOCUS_TAGS'; payload: string[] }
  | { type: 'CLEAR_FOCUS' }
  // Filter Actions
  | { type: 'SET_DATE_RANGE'; payload: { start: Date; end: Date } | null }
  | { type: 'SET_ACTIVE_FILTER'; payload: 'tags' | 'tasks' | 'favorites' | 'new' }
  | { type: 'TOGGLE_HIDDEN_TAG'; payload: string }
  | { type: 'SET_SEARCH_QUERY'; payload: string }
  | { type: 'RESET_FILTERS' }
  // Snapshot Actions
  | { type: 'INCREMENT_SNAPSHOT_VERSION' };

// ======================== Initial State ========================

const initialState: PlanManagerSessionState = {
  focus: {
    lineId: null,
    mode: 'title',
    isTask: false,
    selectedTags: [],
  },
  filter: {
    dateRange: null,
    activeFilter: 'tags',
    hiddenTags: new Set(),
    searchQuery: '',
  },
  snapshotVersion: 0,
};

// ======================== Reducer ========================

function planManagerSessionReducer(
  state: PlanManagerSessionState,
  action: PlanManagerSessionAction
): PlanManagerSessionState {
  switch (action.type) {
    // ===== Focus Actions =====
    case 'SET_FOCUS':
      return {
        ...state,
        focus: {
          lineId: action.payload.lineId,
          mode: action.payload.mode ?? state.focus.mode,
          isTask: action.payload.isTask ?? state.focus.isTask,
          selectedTags: action.payload.selectedTags ?? state.focus.selectedTags,
        },
      };

    case 'UPDATE_FOCUS_MODE':
      return {
        ...state,
        focus: {
          ...state.focus,
          mode: action.payload,
        },
      };

    case 'UPDATE_FOCUS_TASK':
      return {
        ...state,
        focus: {
          ...state.focus,
          isTask: action.payload,
        },
      };

    case 'UPDATE_FOCUS_TAGS':
      return {
        ...state,
        focus: {
          ...state.focus,
          selectedTags: action.payload,
        },
      };

    case 'CLEAR_FOCUS':
      return {
        ...state,
        focus: {
          lineId: null,
          mode: 'title',
          isTask: false,
          selectedTags: [],
        },
      };

    // ===== Filter Actions =====
    case 'SET_DATE_RANGE':
      return {
        ...state,
        filter: {
          ...state.filter,
          dateRange: action.payload,
        },
        snapshotVersion: state.snapshotVersion + 1, // 🔥 自动触发snapshot更新
      };

    case 'SET_ACTIVE_FILTER':
      return {
        ...state,
        filter: {
          ...state.filter,
          activeFilter: action.payload,
        },
      };

    case 'TOGGLE_HIDDEN_TAG':
      const newHiddenTags = new Set(state.filter.hiddenTags);
      if (newHiddenTags.has(action.payload)) {
        newHiddenTags.delete(action.payload);
      } else {
        newHiddenTags.add(action.payload);
      }
      return {
        ...state,
        filter: {
          ...state.filter,
          hiddenTags: newHiddenTags,
        },
      };

    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        filter: {
          ...state.filter,
          searchQuery: action.payload,
        },
      };

    case 'RESET_FILTERS':
      return {
        ...state,
        filter: {
          dateRange: null,
          activeFilter: 'tags',
          hiddenTags: new Set(),
          searchQuery: '',
        },
        snapshotVersion: state.snapshotVersion + 1,
      };

    // ===== Snapshot Actions =====
    case 'INCREMENT_SNAPSHOT_VERSION':
      return {
        ...state,
        snapshotVersion: state.snapshotVersion + 1,
      };

    default:
      return state;
  }
}

// ======================== Hook ========================

export function usePlanManagerSession() {
  const [state, dispatch] = useReducer(planManagerSessionReducer, initialState);

  // ===== Focus Actions =====
  const setFocus = useCallback(
    (lineId: string | null, options?: { mode?: 'title' | 'description'; isTask?: boolean; selectedTags?: string[] }) => {
      dispatch({ type: 'SET_FOCUS', payload: { lineId, ...options } });
    },
    []
  );

  const updateFocusMode = useCallback((mode: 'title' | 'description') => {
    dispatch({ type: 'UPDATE_FOCUS_MODE', payload: mode });
  }, []);

  const updateFocusTask = useCallback((isTask: boolean) => {
    dispatch({ type: 'UPDATE_FOCUS_TASK', payload: isTask });
  }, []);

  const updateFocusTags = useCallback((tags: string[]) => {
    dispatch({ type: 'UPDATE_FOCUS_TAGS', payload: tags });
  }, []);

  const clearFocus = useCallback(() => {
    dispatch({ type: 'CLEAR_FOCUS' });
  }, []);

  // ===== Filter Actions =====
  const setDateRange = useCallback((range: { start: Date; end: Date } | null) => {
    dispatch({ type: 'SET_DATE_RANGE', payload: range });
  }, []);

  const setActiveFilter = useCallback((filter: 'tags' | 'tasks' | 'favorites' | 'new') => {
    dispatch({ type: 'SET_ACTIVE_FILTER', payload: filter });
  }, []);

  const toggleHiddenTag = useCallback((tag: string) => {
    dispatch({ type: 'TOGGLE_HIDDEN_TAG', payload: tag });
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    dispatch({ type: 'SET_SEARCH_QUERY', payload: query });
  }, []);

  const resetFilters = useCallback(() => {
    dispatch({ type: 'RESET_FILTERS' });
  }, []);

  // ===== Snapshot Actions =====
  const incrementSnapshotVersion = useCallback(() => {
    dispatch({ type: 'INCREMENT_SNAPSHOT_VERSION' });
  }, []);

  return {
    state,
    actions: {
      // Focus
      setFocus,
      updateFocusMode,
      updateFocusTask,
      updateFocusTags,
      clearFocus,
      // Filter
      setDateRange,
      setActiveFilter,
      toggleHiddenTag,
      setSearchQuery,
      resetFilters,
      // Snapshot
      incrementSnapshotVersion,
    },
  };
}
