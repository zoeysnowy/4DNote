/**
 * FullContactModal - 联系人完整编辑 Modal
 * 
 * 功能：
 * - 显示所有字段（包括空字段）
 * - 支持内联编辑所有字段
 * - 显示所有关联事件
 * - 保存/取消操作
 */

import React, { useState, useEffect } from 'react';
import { Contact, Event } from '../../types';
import { ContactService } from '../../services/ContactService';
import { EventService } from '../../services/EventService';
import { EditableField } from './EditableField';
import './FullContactModal.css';

interface FullContactModalProps {
  contact: Contact;
  visible: boolean;
  onClose: () => void;
  onSave?: (contact: Contact) => void;
}

export const FullContactModal: React.FC<FullContactModalProps> = ({
  contact,
  visible,
  onClose,
  onSave,
}) => {
  const [editedContact, setEditedContact] = useState<Contact>(contact);
  const [relatedEvents, setRelatedEvents] = useState<Event[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (visible) {
      // 加载完整联系人信息
      const fullInfo = ContactService.getFullContactInfo(contact);
      setEditedContact(fullInfo);
      setHasChanges(false);

      // 加载所有关联事件
      void (async () => {
        const identifier = contact.email || contact.name || '';
        const events = await EventService.getEventsByContact(identifier, 9999);
        setRelatedEvents(events);
      })();
    }
  }, [visible, contact]);

  // 订阅 ContactService 事件，自动刷新或关闭 Modal
  useEffect(() => {
    if (!visible || !editedContact?.id) return;

    const handleContactUpdated = (event: any) => {
      const { id, after } = event.data;
      
      // 如果更新的是当前编辑的联系人，自动刷新显示
      if (id === editedContact.id) {
        console.log('[FullContactModal] 📇 收到联系人更新事件，自动刷新显示');
        
        // 重新加载完整信息（包括关联事件）
        const fullInfo = ContactService.getFullContactInfo(after);
        setEditedContact(fullInfo);

        void (async () => {
          const identifier = after.email || after.name || '';
          const events = await EventService.getEventsByContact(identifier, 9999);
          setRelatedEvents(events);
        })();
        
        // 如果是外部更新（不是自己触发的），清除 hasChanges 标志
        setHasChanges(false);
      }
    };

    const handleContactDeleted = (event: any) => {
      const { id } = event.data;
      
      // 如果删除的是当前编辑的联系人，关闭 Modal
      if (id === editedContact.id) {
        console.log('[FullContactModal] 🗑️ 当前联系人已被删除，关闭 Modal');
        onClose();
      }
    };

    ContactService.addEventListener('contact.updated', handleContactUpdated);
    ContactService.addEventListener('contact.deleted', handleContactDeleted);

    return () => {
      ContactService.removeEventListener('contact.updated', handleContactUpdated);
      ContactService.removeEventListener('contact.deleted', handleContactDeleted);
    };
  }, [visible, editedContact?.id, onClose]);

  const handleFieldUpdate = (field: keyof Contact, value: any) => {
    setEditedContact(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    if (!editedContact.id) {
      console.error('[FullContactModal] Cannot save contact without ID');
      return;
    }

    // 直接调用 ContactService.updateContact，它会触发事件
    // 事件订阅会自动更新 editedContact 状态和关联事件
    ContactService.updateContact(editedContact.id, editedContact);
    onSave?.(editedContact);
    onClose();
  };

  const handleCancel = () => {
    if (hasChanges) {
      const confirmed = window.confirm('有未保存的更改，确定要关闭吗？');
      if (!confirmed) return;
    }
    onClose();
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { 
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const extractEmoji = (title: string): string => {
    // 使用 ES5 兼容的 emoji 检测
    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+|[\u2600-\u27BF]/;
    const match = title.match(emojiRegex);
    return match ? match[0] : '📅';
  };

  const removeEmoji = (title: string): string => {
    // 使用 ES5 兼容的 emoji 检测
    const emojiRegex = /[\uD83C-\uDBFF\uDC00-\uDFFF]+|[\u2600-\u27BF]/g;
    return title.replace(emojiRegex, '').trim();
  };

  if (!visible) return null;

  return (
    <div className="full-contact-modal-overlay" onClick={handleCancel}>
      <div className="full-contact-modal" onClick={(e) => e.stopPropagation()}>
        {/* Modal 头部 */}
        <div className="full-contact-modal-header">
          <h3>{editedContact.name || '新联系人'}</h3>
          <button 
            className="full-contact-modal-close"
            onClick={handleCancel}
          >
            ✕
          </button>
        </div>

        {/* Modal 内容 */}
        <div className="full-contact-modal-body">
          {/* 基本信息 */}
          <section className="full-contact-section">
            <h4>基本信息</h4>
            <div className="full-contact-fields">
              <EditableField
                label="姓名"
                value={editedContact.name}
                placeholder="请输入姓名"
                onSave={(value) => handleFieldUpdate('name', value)}
              />
              <EditableField
                label="邮箱"
                value={editedContact.email}
                placeholder="请输入邮箱"
                onSave={(value) => handleFieldUpdate('email', value)}
              />
              <EditableField
                label="电话"
                value={editedContact.phone}
                placeholder="请输入电话"
                onSave={(value) => handleFieldUpdate('phone', value)}
              />
            </div>
          </section>

          {/* 公司信息 */}
          <section className="full-contact-section">
            <h4>公司信息</h4>
            <div className="full-contact-fields">
              <EditableField
                label="公司"
                value={editedContact.organization}
                placeholder="请输入公司名称"
                onSave={(value) => handleFieldUpdate('organization', value)}
              />
              <EditableField
                label="职位"
                value={editedContact.position}
                placeholder="请输入职位"
                onSave={(value) => handleFieldUpdate('position', value)}
              />
            </div>
          </section>

          {/* 备注 */}
          <section className="full-contact-section">
            <h4>备注</h4>
            <div className="full-contact-fields">
              <EditableField
                label=""
                value={editedContact.notes}
                placeholder="添加备注..."
                multiline
                onSave={(value) => handleFieldUpdate('notes', value)}
              />
            </div>
          </section>

          {/* 来源标签 */}
          <section className="full-contact-section">
            <h4>来源</h4>
            <div className="full-contact-sources">
              {editedContact.isOutlook && <span className="source-tag outlook">Outlook</span>}
              {editedContact.isGoogle && <span className="source-tag google">Google</span>}
              {editedContact.isiCloud && <span className="source-tag icloud">iCloud</span>}
              {editedContact.is4DNote && <span className="source-tag remarkable">ReMarkable</span>}
              {!editedContact.isOutlook && !editedContact.isGoogle && !editedContact.isiCloud && !editedContact.is4DNote && (
                <span className="source-tag default">本地</span>
              )}
            </div>
          </section>

          {/* 关联事件 */}
          {relatedEvents.length > 0 && (
            <section className="full-contact-section">
              <h4>关联事件（共 {relatedEvents.length} 个）</h4>
              <div className="full-contact-events">
                {relatedEvents.map(event => (
                  <div 
                    key={event.id} 
                    className="full-contact-event-item"
                    onClick={() => {
                      // TODO: 打开事件详情
                      console.log('Open event:', event.id);
                    }}
                  >
                    <span className="full-contact-event-emoji">
                      {extractEmoji(event.title?.simpleTitle || '')}
                    </span>
                    <div className="full-contact-event-content">
                      <div className="full-contact-event-title">
                        {removeEmoji(event.title?.simpleTitle || '')}
                      </div>
                      <div className="full-contact-event-date">
                        {formatDate(event.startTime)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Modal 底部 */}
        <div className="full-contact-modal-footer">
          <button 
            className="full-contact-modal-btn-cancel"
            onClick={handleCancel}
          >
            取消
          </button>
          <button 
            className="full-contact-modal-btn-save"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
};
