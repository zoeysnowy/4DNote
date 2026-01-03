/**
 * SimpleDatePicker - 简单的日期选择器测试
 */

import React from 'react';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

interface SimpleDatePickerProps {
  onSelect: (start: Date, end: Date) => void;
  onClose: () => void;
}

export const SimpleDatePicker: React.FC<SimpleDatePickerProps> = ({
  onSelect,
  onClose,
}) => {
  return (
    <div style={{ 
      padding: '20px', 
      background: 'white', 
      border: '2px solid blue',
      borderRadius: '8px',
      minWidth: '400px'
    }}>
      <h3>简单日期选择器测试</h3>
      
      <div style={{ marginBottom: '16px' }}>
        <RangePicker
          placeholder={['开始日期', '结束日期']}
          onChange={(dates) => {
            if (dates && dates[0] && dates[1]) {
              onSelect(dates[0].toDate(), dates[1].toDate());
            }
          }}
          onOpenChange={(open) => {
            if (open) {
              setTimeout(() => {
                // 检查输入框内部
                const inputs = document.querySelectorAll('.ant-picker-input input');
                inputs.forEach((input, index) => {
                  const rect = input.getBoundingClientRect();
                  // 检查输入框的父容器
                  const parent = input.parentElement;
                  if (parent) {
                    // console.log(`🔍 Input ${index} parent styles:`, {
                    //   overflow: window.getComputedStyle(parent).overflow,
                    //   position: window.getComputedStyle(parent).position,
                    //   zIndex: window.getComputedStyle(parent).zIndex,
                    //   height: window.getComputedStyle(parent).height,
                    //   maxHeight: window.getComputedStyle(parent).maxHeight
                    // });
                  }
                });
                
                // 强制让日历弹出到 body
                const dropdown = document.querySelector('.ant-picker-dropdown');
                if (dropdown) {
                  document.body.appendChild(dropdown);
                  
                  const dropdownElement = dropdown as HTMLElement;
                  dropdownElement.style.cssText = `
                    position: fixed !important;
                    top: 200px !important;
                    left: 200px !important;
                    z-index: 99999 !important;
                    background: white !important;
                    border: 3px solid red !important;
                    padding: 20px !important;
                    box-shadow: 0 0 20px rgba(0,0,0,0.5) !important;
                    width: auto !important;
                    height: auto !important;
                    min-width: 300px !important;
                    min-height: 300px !important;
                  `;
                }
              }, 100);
            }
          }}
          style={{ width: '100%' }}
          size="large"
          getPopupContainer={() => document.body}
        />
      </div>
      
      <div style={{ textAlign: 'right' }}>
        <button 
          onClick={onClose}
          style={{
            padding: '8px 16px',
            background: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          关闭
        </button>
      </div>
    </div>
  );
};