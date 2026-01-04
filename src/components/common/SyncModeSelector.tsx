/**
 * SyncModeSelector - 同步模式选择器组件
 * 
 * 用于选择 Plan 或 Actual 的日历同步模式，支持 Private 模式
 */

import React, { useState } from 'react';
import { PlanSyncMode, ActualSyncMode } from '@frontend/types';
import { getSyncModeConfig, isValidPlanSyncMode, isValidActualSyncMode } from '@frontend/utils/calendarSyncUtils';
import './SyncModeSelector.css';

interface SyncModeSelectorProps {
  mode: PlanSyncMode | ActualSyncMode;
  disabled?: boolean;
  isActual?: boolean;  // 是否为 Actual 模式选择器
  onChange: (mode: PlanSyncMode | ActualSyncMode) => void;
  className?: string;
}

/**
 * 同步模式选择器组件
 * 用于选择与外部日历的同步模式
 */
export function SyncModeSelector({ 
  mode, 
  disabled = false, 
  isActual = false,
  onChange,
  className = ''
}: SyncModeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // 获取当前模式的显示配置
  const currentConfig = getSyncModeConfig(mode);
  
  // 获取可用的模式选项
  const getAvailableModes = (): Array<{ mode: string; config: any }> => {
    if (isActual) {
      // Actual 模式：不支持 receive-only
      return [
        { mode: 'send-only', config: getSyncModeConfig('send-only') },
        { mode: 'send-only-private', config: getSyncModeConfig('send-only-private') },
        { mode: 'bidirectional', config: getSyncModeConfig('bidirectional') },
        { mode: 'bidirectional-private', config: getSyncModeConfig('bidirectional-private') }
      ];
    } else {
      // Plan 模式：支持所有模式
      return [
        { mode: 'receive-only', config: getSyncModeConfig('receive-only') },
        { mode: 'send-only', config: getSyncModeConfig('send-only') },
        { mode: 'send-only-private', config: getSyncModeConfig('send-only-private') },
        { mode: 'bidirectional', config: getSyncModeConfig('bidirectional') },
        { mode: 'bidirectional-private', config: getSyncModeConfig('bidirectional-private') }
      ];
    }
  };
  
  const availableModes = getAvailableModes();
  
  const handleModeSelect = (newMode: string) => {
    if (disabled) return;
    
    // 验证模式有效性
    const isValid = isActual ? isValidActualSyncMode(newMode) : isValidPlanSyncMode(newMode);
    if (!isValid) {
      console.warn(`Invalid sync mode for ${isActual ? 'Actual' : 'Plan'}: ${newMode}`);
      return;
    }
    
    onChange(newMode as PlanSyncMode | ActualSyncMode);
    setIsOpen(false);
  };
  
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (disabled) return;
      setIsOpen(!isOpen);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };
  
  return (
    <div className={`sync-mode-selector ${className} ${disabled ? 'disabled' : ''}`}>
      <button 
        className="sync-mode-button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        style={{ borderColor: currentConfig.color }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title={`当前模式: ${currentConfig.label}${disabled ? ' (禁用)' : ''}`}
      >
        <span className="sync-icon">{currentConfig.icon}</span>
        <span className="sync-label">{currentConfig.label}</span>
        <span className="dropdown-arrow">▼</span>
      </button>
      
      {isOpen && !disabled && (
        <div className="sync-mode-dropdown" role="listbox">
          {availableModes.map(({ mode: modeOption, config }) => (
            <button
              key={modeOption}
              className={`sync-mode-option ${mode === modeOption ? 'selected' : ''}`}
              onClick={() => handleModeSelect(modeOption)}
              style={{ borderLeftColor: config.color }}
              role="option"
              aria-selected={mode === modeOption}
            >
              <span className="sync-icon">{config.icon}</span>
              <span className="sync-label">{config.label}</span>
              {mode === modeOption && <span className="check-mark">✓</span>}
            </button>
          ))}
          
          {/* 添加说明文字 */}
          <div className="sync-mode-help">
            <div className="help-item">
              <span className="help-icon">🔒</span>
              <span className="help-text">私人模式：不邀请参与者</span>
            </div>
            {!isActual && (
              <div className="help-item">
                <span className="help-icon">📥</span>
                <span className="help-text">只接收：仅 Plan 支持</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 点击外部关闭下拉框 */}
      {isOpen && (
        <div 
          className="sync-mode-overlay"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * 同步模式循环切换（备用方案）
 */
export function cycleSyncMode(
  currentMode: PlanSyncMode | ActualSyncMode, 
  isActual: boolean,
  onChange: (mode: PlanSyncMode | ActualSyncMode) => void
) {
  const modes = isActual 
    ? ['send-only', 'send-only-private', 'bidirectional', 'bidirectional-private']
    : ['receive-only', 'send-only', 'send-only-private', 'bidirectional', 'bidirectional-private'];
  
  const currentIndex = modes.indexOf(currentMode);
  const nextIndex = (currentIndex + 1) % modes.length;
  const nextMode = modes[nextIndex];
  
  onChange(nextMode as PlanSyncMode | ActualSyncMode);
}

export default SyncModeSelector;