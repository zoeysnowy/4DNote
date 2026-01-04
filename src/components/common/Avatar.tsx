/**
 * Avatar - 头像组件
 * 
 * 支持多种头像来源：
 * - 自定义 URL
 * - Gravatar（基于邮箱）
 * - 首字母头像
 */

import React from 'react';
import { Contact } from '@frontend/types';
import { ContactService } from '@backend/ContactService';

interface AvatarProps {
  contact: Contact;
  size?: number;
  className?: string;
  showTooltip?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  contact,
  size = 32,
  className = '',
  showTooltip = true,
}) => {
  const avatarUrl = ContactService.getAvatarUrl(contact);
  const displayName = contact.name || contact.email || '?';
  const initial = displayName.charAt(0).toUpperCase();

  const [imageError, setImageError] = React.useState(false);

  const avatarStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'inline-block',
  };

  const fallbackStyle: React.CSSProperties = {
    ...avatarStyle,
    backgroundColor: '#1890ff',
    color: '#fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.4,
    fontWeight: 'bold',
  };

  const title = showTooltip ? displayName : undefined;

  if (imageError || !avatarUrl) {
    return (
      <div style={fallbackStyle} className={className} title={title}>
        {initial}
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={displayName}
      style={avatarStyle}
      className={className}
      title={title}
      onError={() => setImageError(true)}
    />
  );
};

/**
 * AvatarGroup - 头像组
 * 用于显示多个参会人的头像
 */
interface AvatarGroupProps {
  contacts: Contact[];
  maxDisplay?: number;
  size?: number;
  className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
  contacts,
  maxDisplay = 5,
  size = 32,
  className = '',
}) => {
  const displayContacts = contacts.slice(0, maxDisplay);
  const remainingCount = contacts.length - maxDisplay;

  const groupStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: -size * 0.3, // 重叠效果
  };

  const moreStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    backgroundColor: '#f0f0f0',
    border: '2px solid #fff',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: size * 0.35,
    color: '#666',
    fontWeight: 'bold',
    marginLeft: size * 0.3,
  };

  return (
    <div style={groupStyle} className={className}>
      {displayContacts.map((contact, index) => (
        <div
          key={contact.id || index}
          style={{
            position: 'relative',
            zIndex: displayContacts.length - index,
            border: '2px solid #fff',
            borderRadius: '50%',
          }}
        >
          <Avatar contact={contact} size={size} showTooltip={true} />
        </div>
      ))}
      {remainingCount > 0 && (
        <div style={moreStyle} title={`还有 ${remainingCount} 人`}>
          +{remainingCount}
        </div>
      )}
    </div>
  );
};
