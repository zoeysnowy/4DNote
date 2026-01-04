/**
 * ContactPreviewCard - 联系人悬浮预览卡片
 * 
 * 功能：
 * - 鼠标悬浮 1 秒后显示
 * - 显示联系人完整信息
 * - 显示最近 5 个关联事件
 * - 支持内联编辑字段
 * - 可展开为完整编辑 Modal
 */

import React, { useState, useEffect } from 'react';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { Contact, Event } from '@frontend/types';
import { ContactService } from '@backend/ContactService';
import { EventService } from '@backend/EventService';
import { EditableField } from './EditableField';
import './ContactPreviewCard.css';

interface ContactWithEvents extends Contact {
  recentEvents?: Event[];
  totalEvents?: number;
}

interface ContactPreviewCardProps {
  contact: Contact;
  children: React.ReactElement;
  delay?: number;
  onExpand?: (contact: Contact) => void;
  onUpdate?: (contact: Contact) => void;
}

export const ContactPreviewCard: React.FC<ContactPreviewCardProps> = ({
  contact,
  children,
  delay = 1000,
  onExpand,
  onUpdate,
}) => {
  const [fullContact, setFullContact] = useState<ContactWithEvents | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // 订阅 ContactService 事件，自动刷新显示的联系人数据
  useEffect(() => {
    if (!fullContact?.id) return;

    const handleContactUpdated = (event: any) => {
      const { id, after } = event.data;
      
      // 如果更新的是当前显示的联系人，自动刷新
      if (id === fullContact.id) {
        console.log('[ContactPreviewCard] 📇 收到联系人更新事件，自动刷新显示');

        // 重新获取完整信息（包括关联事件）
        void (async () => {
          const identifier = after.email || after.name || '';
          const events = await EventService.getEventsByContact(identifier, 5);
          const allEvents = await EventService.getEventsByContact(identifier, 9999);

          setFullContact({
            ...after,
            recentEvents: events,
            totalEvents: allEvents.length,
          });

          onUpdate?.(after);
        })();
      }
    };

    const handleContactDeleted = (event: any) => {
      const { id } = event.data;
      
      // 如果删除的是当前显示的联系人，清空显示
      if (id === fullContact.id) {
        console.log('[ContactPreviewCard] 🗑️ 当前联系人已被删除，清空显示');
        setFullContact(null);
      }
    };

    ContactService.addEventListener('contact.updated', handleContactUpdated);
    ContactService.addEventListener('contact.deleted', handleContactDeleted);

    return () => {
      ContactService.removeEventListener('contact.updated', handleContactUpdated);
      ContactService.removeEventListener('contact.deleted', handleContactDeleted);
    };
  }, [fullContact?.id, onUpdate]);

  const loadContactInfo = async () => {
    if (isLoading || fullContact) return;
    
    setIsLoading(true);
    try {
      // 获取完整联系人信息
      const contactInfo = ContactService.getFullContactInfo(contact);
      
      // 获取关联事件
      const identifier = contact.email || contact.name || '';
      const events = await EventService.getEventsByContact(identifier, 5);
      const allEvents = await EventService.getEventsByContact(identifier, 9999);
      
      setFullContact({
        ...contactInfo,
        recentEvents: events,
        totalEvents: allEvents.length,
      });
    } catch (error) {
      console.error('[ContactPreviewCard] Failed to load contact info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = async (field: string, value: any) => {
    if (!fullContact?.id) return;
    
    try {
      // 直接调用 ContactService.updateContact，它会触发事件
      // 事件订阅会自动更新 fullContact 状态，无需手动更新
      ContactService.updateContact(fullContact.id, { [field]: value });
    } catch (error) {
      console.error('[ContactPreviewCard] Failed to update contact:', error);
    }
  };

  const formatDate = (dateString?: string): string => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
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

  const renderPreviewContent = () => {
    if (!fullContact) return null;

    return (
      <div className="contact-preview-card">
        {/* 卡片头部 */}
        <div className="contact-preview-header">
          <h4 className="contact-preview-name">{fullContact.name || '未命名'}</h4>
          {onExpand && (
            <button 
              className="contact-preview-expand-btn"
              onClick={() => onExpand(fullContact)}
            >
              展开
            </button>
          )}
        </div>

        {/* 可编辑字段（只显示有值的字段）*/}
        <div className="contact-preview-fields">
          {fullContact.email && (
            <EditableField
              label="邮箱"
              value={fullContact.email}
              onSave={(value) => handleUpdateField('email', value)}
            />
          )}
          {fullContact.phone && (
            <EditableField
              label="电话"
              value={fullContact.phone}
              onSave={(value) => handleUpdateField('phone', value)}
            />
          )}
          {fullContact.organization && (
            <EditableField
              label="公司"
              value={fullContact.organization}
              onSave={(value) => handleUpdateField('organization', value)}
            />
          )}
          {fullContact.notes && (
            <EditableField
              label="备注"
              value={fullContact.notes}
              multiline
              onSave={(value) => handleUpdateField('notes', value)}
            />
          )}
        </div>

        {/* 关联事件 */}
        {fullContact.recentEvents && fullContact.recentEvents.length > 0 && (
          <div className="contact-preview-events">
            <h5>关联事件（最近 5 个）</h5>
            {fullContact.recentEvents.map(event => (
              <div 
                key={event.id} 
                className="contact-preview-event-item"
                onClick={() => {
                  // TODO: 打开事件详情
                  console.log('Open event:', event.id);
                }}
              >
                <span className="contact-preview-event-emoji">
                  {extractEmoji(event.title?.simpleTitle || '')}
                </span>
                <span className="contact-preview-event-title">
                  {removeEmoji(event.title?.simpleTitle || '')}
                </span>
                <span className="contact-preview-event-date">
                  {formatDate(event.startTime)}
                </span>
              </div>
            ))}
            {fullContact.totalEvents && fullContact.totalEvents > 5 && (
              <button 
                className="contact-preview-view-more"
                onClick={() => onExpand?.(fullContact)}
              >
                查看全部 {fullContact.totalEvents} 个关联事件
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Tippy
      content={renderPreviewContent()}
      interactive
      delay={[delay, 0]}
      placement="right-start"
      onShow={() => { loadContactInfo(); }}
      onHide={() => setFullContact(null)}
      maxWidth={360}
      className="contact-preview-tippy"
    >
      {children}
    </Tippy>
  );
};
