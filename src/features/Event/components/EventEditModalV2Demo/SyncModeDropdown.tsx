import React from 'react';

interface SyncMode {
  id: string;
  name: string;
  emoji: string;
}

interface SyncModeDropdownProps {
  availableModes: SyncMode[];
  selectedModeId: string;
  onSelectionChange: (modeId: string) => void;
  onClose?: () => void;
  title?: string;
}

/**
 * 同步模式选择下拉组件
 */
export const SyncModeDropdown: React.FC<SyncModeDropdownProps> = ({
  availableModes,
  selectedModeId,
  onSelectionChange,
  onClose,
  title = "选择同步模式"
}) => {
  return (
    <div style={{
      padding: '12px'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '12px',
        paddingBottom: '8px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <span style={{
          fontSize: '14px',
          fontWeight: '500',
          color: '#374151'
        }}>{title}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            fontSize: '18px',
            cursor: 'pointer',
            padding: '0',
            width: '20px',
            height: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#6B7280';
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#9CA3AF';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          ✕
        </button>
      </div>

      <div style={{
        maxHeight: '200px',
        overflowY: 'auto'
      }}>
        {availableModes.map(mode => {
          const isSelected = selectedModeId === mode.id;

          return (
            <label
              key={mode.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: '6px',
                marginBottom: '4px',
                backgroundColor: isSelected ? '#f3f4f6' : 'transparent',
                transition: 'all 0.2s ease'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('🖱️ [SyncModeDropdown] Clicked mode:', mode.id, mode.name);
                onSelectionChange(mode.id);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = isSelected ? '#f3f4f6' : '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isSelected ? '#f3f4f6' : 'transparent';
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                readOnly
                style={{
                  marginRight: '8px',
                  accentColor: '#3b82f6',
                  cursor: 'pointer',
                  pointerEvents: 'none'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
                {/* Emoji 图标 */}
                <span 
                  style={{ 
                    backgroundColor: 'transparent',
                    width: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    flexShrink: 0
                  }}
                >
                  {mode.emoji}
                </span>
                
                {/* 模式名称 */}
                <span style={{ 
                  fontSize: '14px',
                  color: '#374151',
                  fontWeight: isSelected ? '500' : '400'
                }}>{mode.name}</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};