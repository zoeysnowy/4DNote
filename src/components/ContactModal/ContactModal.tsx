/**
 * ContactModal - 独立的联系人编辑模态框组件
 * 
 * 功能：
 * - 支持 create/edit/view 三种模式
 * - 集成 Tippy 定位（通过 triggerElement 和 placement）
 * - 内联编辑所有字段
 * - Enter 键在字段间跳转
 * - 通过 ContactService 事件机制自动更新
 * - 不依赖外部状态（完全独立）
 */

import React, { useState, useRef, useEffect } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { Contact } from '../../types';
import { ContactService } from '../../services/ContactService';
import './ContactModal.css';

export type ContactModalMode = 'create' | 'edit' | 'view';

export interface ContactModalProps {
  /** 是否显示 Modal */
  visible: boolean;
  /** 联系人对象（edit/view 模式必填） */
  contact?: Contact;
  /** Modal 模式 */
  mode?: ContactModalMode;
  /** 关闭回调 */
  onClose: () => void;
  /** 触发元素（用于 Tippy 定位） */
  triggerElement?: HTMLElement;
  /** Tippy placement */
  placement?: 'top' | 'bottom' | 'top-start' | 'bottom-start';
  /** 初始聚焦字段 */
  initialFocus?: 'name' | 'email' | 'phone' | 'organization';
  /** 保存成功回调（可选） */
  onSave?: (contact: Contact) => void;
  /** 删除成功回调（可选） */
  onDelete?: (contactId: string) => void;
}

/**
 * 格式化联系人来源
 */
const formatSource = (contact: Contact): string => {
  if (contact.is4DNote) return '4DNote 联系人';
  if (contact.isOutlook) return 'Outlook 联系人';
  if (contact.isGoogle) return 'Google 联系人';
  if (contact.isiCloud) return 'iCloud 联系人';
  return '历史参会人';
};

export const ContactModal: React.FC<ContactModalProps> = ({
  visible,
  contact,
  mode = 'edit',
  onClose,
  triggerElement,
  placement = 'bottom-start',
  initialFocus = 'name',
  onSave,
  onDelete,
}) => {
  const contactEditableRef = useRef<HTMLDivElement>(null);
  const modalTriggerRef = useRef<HTMLSpanElement>(null);
  
  // 保存初始值（用于比较是否有变更）
  const [initialValues] = useState({
    name: contact?.name || '',
    email: contact?.email || '',
    phone: contact?.phone || '',
    organization: contact?.organization || '',
  });

  // 聚焦到指定字段
  useEffect(() => {
    if (visible && contactEditableRef.current && mode !== 'view') {
      setTimeout(() => {
        const field = contactEditableRef.current?.querySelector(
          `.contact-field:nth-child(${
            initialFocus === 'name' ? 1 :
            initialFocus === 'email' ? 2 :
            initialFocus === 'phone' ? 3 : 4
          }) .contact-value`
        );
        
        if (field && field.firstChild) {
          const range = document.createRange();
          const selection = window.getSelection();
          range.setStart(field.firstChild, 0);
          range.collapse(true);
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 100);
    }
  }, [visible, initialFocus, mode]);

  /**
   * 处理 Enter 键跳转到下一个字段
   */
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter' && !(e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      
      // 获取当前光标位置
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      
      const range = selection.getRangeAt(0);
      let currentNode = range.startContainer;
      
      // 如果在文本节点中，找到它的父元素
      if (currentNode.nodeType === Node.TEXT_NODE) {
        currentNode = currentNode.parentElement as Node;
      }
      
      // 找到当前所在的字段
      const currentField = (currentNode as Element).closest('.contact-field');
      if (!currentField) return;
      
      // 找到下一个字段
      const nextField = currentField.nextElementSibling;
      if (!nextField || !nextField.classList.contains('contact-field')) {
        // 已经是最后一个字段，保存并关闭
        handleSave();
        return;
      }
      
      // 找到下一个字段的可编辑区域
      const nextEditable = nextField.querySelector('.contact-value');
      if (!nextEditable || !nextEditable.firstChild) return;
      
      // 设置光标到下一个字段的开头
      const newRange = document.createRange();
      const newSelection = window.getSelection();
      
      newRange.setStart(nextEditable.firstChild, 0);
      newRange.collapse(true);
      newSelection?.removeAllRanges();
      newSelection?.addRange(newRange);
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl/Cmd + Enter 保存并关闭
      e.preventDefault();
      handleSave();
    }
  };

  /**
   * 保存联系人
   */
  const handleSave = async () => {
    if (!contactEditableRef.current) return;
    
    // 提取各个字段的值
    const fields = contactEditableRef.current.querySelectorAll('.contact-field');
    const updates: Partial<Contact> = {};
    let hasChanges = false;
    
    fields.forEach((field) => {
      const label = field.querySelector('.contact-label')?.textContent?.replace('：', '').trim();
      const valueElement = field.querySelector('.contact-value');
      const value = valueElement?.textContent?.trim() || '';
      
      const fieldName = 
        label === '姓名' ? 'name' :
        label === '邮箱' ? 'email' :
        label === '电话' ? 'phone' : 'organization';
      
      if (value !== initialValues[fieldName]) {
        updates[fieldName] = value;
        hasChanges = true;
      }
    });
    
    if (hasChanges) {
      if (mode === 'create') {
        // 创建新联系人
        const newContact = await ContactService.addContact({
          name: updates.name || '',
          email: updates.email,
          phone: updates.phone,
          organization: updates.organization,
          is4DNote: true,
        });
        onSave?.(newContact);
      } else if (contact?.id) {
        // 更新现有联系人
        const updated = await ContactService.updateContact(contact.id, updates);
        if (updated) {
          onSave?.(updated);
        }
      }
    }
    
    onClose();
  };

  /**
   * 删除联系人
   */
  const handleDelete = () => {
    if (!contact?.id) return;
    
    if (confirm(`确定要删除联系人 "${contact.name}" 吗？`)) {
      void ContactService.deleteContact(contact.id);
      onDelete?.(contact.id);
      onClose();
    }
  };

  if (!visible) return null;

  const modalContent = (
    <div 
      className="contact-modal"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <div className="modal-header">
        <div className="modal-header-left">
          <h3>
            {mode === 'create' ? '新建联系人' : 
             mode === 'view' ? '联系人信息' : '编辑联系人'}
          </h3>
          {mode === 'edit' && <span className="modal-hint">点击编辑 • Enter跳转 • Ctrl+Enter保存</span>}
        </div>
        <button 
          className="close-btn"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
        
      <div 
        ref={contactEditableRef}
        className="modal-body-editable"
        contentEditable={mode !== 'view'}
        suppressContentEditableWarning
        onBlur={mode !== 'view' ? handleSave : undefined}
      >
        <div className="contact-field">
          <span className="contact-label" contentEditable={false}>姓名：</span>
          <span className="contact-value">{contact?.name || ''}</span>
        </div>
        <div className="contact-field">
          <span className="contact-label" contentEditable={false}>邮箱：</span>
          <span className="contact-value">{contact?.email || ''}</span>
        </div>
        <div className="contact-field">
          <span className="contact-label" contentEditable={false}>电话：</span>
          <span className="contact-value">{contact?.phone || ''}</span>
        </div>
        <div className="contact-field">
          <span className="contact-label" contentEditable={false}>组织：</span>
          <span className="contact-value">{contact?.organization || ''}</span>
        </div>
        {contact && (
          <div className="contact-field">
            <span className="contact-label" contentEditable={false}>来源：</span>
            <span className="contact-value contact-value-readonly" contentEditable={false}>
              {formatSource(contact)}
            </span>
          </div>
        )}
      </div>
        
      <div className="modal-footer">
        {mode === 'edit' && contact?.id && (
          <button 
            className="btn-delete"
            onClick={handleDelete}
          >
            删除
          </button>
        )}
        <button 
          className="btn-primary"
          onClick={handleSave}
        >
          {mode === 'create' ? '创建' : '完成'}
        </button>
      </div>
    </div>
  );

  // 如果有 triggerElement，使用 Tippy 定位
  if (triggerElement) {
    return (
      <>
        <div 
          className="contact-modal-backdrop" 
          onClick={onClose}
        />
        <Tippy
          content={modalContent}
          visible={visible}
          interactive={true}
          placement={placement}
          arrow={false}
          offset={[0, 0]}
          maxWidth="none"
          appendTo={() => document.body}
          onClickOutside={onClose}
          popperOptions={{
            modifiers: [
              { name: 'flip', options: { enabled: false } },
              { name: 'preventOverflow', options: { enabled: false } },
            ],
          }}
          getReferenceClientRect={() => triggerElement.getBoundingClientRect()}
        >
          <span ref={modalTriggerRef} style={{ visibility: 'hidden', position: 'absolute' }} />
        </Tippy>
      </>
    );
  }

  // 否则居中显示
  return (
    <>
      <div 
        className="contact-modal-backdrop" 
        onClick={onClose}
      />
      <div className="contact-modal-wrapper">
        {modalContent}
      </div>
    </>
  );
};
