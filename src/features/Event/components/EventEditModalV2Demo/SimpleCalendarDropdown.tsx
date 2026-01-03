import React from 'react';

interface Calendar {
  id: string;
  name: string;
  color: string;
}

interface SimpleCalendarDropdownProps {
  availableCalendars: Calendar[];
  selectedCalendarId?: string;  // 单选模式（向后兼容）
  selectedCalendarIds?: string[]; // 多选模式
  onSelectionChange?: (calendarId: string) => void;  // 单选回调（向后兼容）
  onMultiSelectionChange?: (calendarIds: string[]) => void; // 多选回调
  onClose?: () => void;
  title?: string;
  multiSelect?: boolean;  // 是否启用多选模式
}

/**
 * 简化的日历选择下拉组件 - 支持单选和多选模式
 * 多选模式：显示第一个日历 + "等" 字
 */
export const SimpleCalendarDropdown: React.FC<SimpleCalendarDropdownProps> = ({
  availableCalendars,
  selectedCalendarId,
  selectedCalendarIds = [],
  onSelectionChange,
  onMultiSelectionChange,
  onClose,
  title = "选择日历",
  multiSelect = false
}) => {
  // 确定当前选中的日历列表
  const currentSelectedIds = multiSelect 
    ? selectedCalendarIds 
    : (selectedCalendarId ? [selectedCalendarId] : []);
  
  console.log('🎯 [SimpleCalendarDropdown] Component rendered:', {
    availableCalendarsCount: availableCalendars.length,
    availableCalendars: availableCalendars.map(c => ({ id: c.id, name: c.name })),
    selectedCalendarIds,
    currentSelectedIds,
    multiSelect,
    hasOnMultiSelectionChange: !!onMultiSelectionChange,
    hasOnSelectionChange: !!onSelectionChange
  });

  // 获取日历显示名称
  const getCalendarName = (calendar: Calendar) => {
    // 从 calendar.name 中解析名称，去除 emoji 前缀（使用兼容的正则表达式）
    const cleanName = calendar.name.replace(/^[\uD83C-\uDBFF\uDC00-\uDFFF]+\s*/, '');
    return cleanName;
  };

  const getCalendarColor = (calendar: Calendar) => {
    return calendar.color || '#3498db';
  };

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
        {availableCalendars.map(calendar => {
          const isSelected = currentSelectedIds.includes(calendar.id);
          const isDisabled = false;

          const handleSelect = () => {
            console.log('🖱️ [SimpleCalendarDropdown] handleSelect called:', {
              calendarId: calendar.id,
              calendarName: calendar.name,
              isDisabled,
              isSelected,
              multiSelect,
              currentSelectedIds
            });
            
            if (isDisabled) return;
            
            if (multiSelect) {
              // 多选模式
              const newSelection = isSelected
                ? currentSelectedIds.filter(id => id !== calendar.id)
                : [...currentSelectedIds, calendar.id];
              
              console.log('📤 [SimpleCalendarDropdown] Calling onMultiSelectionChange:', newSelection);
              onMultiSelectionChange?.(newSelection);
            } else {
              // 单选模式（向后兼容）
              console.log('📤 [SimpleCalendarDropdown] Calling onSelectionChange:', calendar.id);
              onSelectionChange?.(calendar.id);
            }
          };

          return (
            <label
              key={calendar.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 12px',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                marginBottom: '4px',
                backgroundColor: isSelected ? '#f3f4f6' : 'transparent',
                opacity: isDisabled ? 0.5 : 1,
                transition: 'all 0.2s ease'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSelect();
              }}
              onMouseEnter={(e) => {
                if (!isDisabled) {
                  e.currentTarget.style.backgroundColor = isSelected ? '#f3f4f6' : '#f9fafb';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isSelected ? '#f3f4f6' : 'transparent';
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                readOnly
                disabled={isDisabled}
                style={{
                  marginRight: '8px',
                  accentColor: '#3b82f6',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  pointerEvents: 'none'
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none' }}>
                {/* 颜色圆点 */}
                <span 
                  style={{ 
                    backgroundColor: getCalendarColor(calendar),
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    display: 'inline-block',
                    flexShrink: 0
                  }}
                ></span>
                
                {/* 日历名称 */}
                <span style={{ 
                  fontSize: '14px',
                  color: '#374151',
                  fontWeight: isSelected ? '500' : '400'
                }}>{getCalendarName(calendar)}</span>
              </div>
            </label>
          );
        })} 
      </div>
    </div>
  );
};