/**
 * ContactPicker - 联系人选择器组件
 * 
 * 功能：
 * - 搜索和选择联系人
 * - 支持批量添加
 * - 显示联系人头像和平台来源
 */

import React, { useState, useEffect } from 'react';
import { Modal, Input, List, Checkbox, Button, Tag, Space, Empty } from 'antd';
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons';
import { Contact, ContactSource } from '@frontend/types';
import { ContactService } from '@backend/ContactService';
import { Avatar } from './Avatar';

interface ContactPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (contacts: Contact[]) => void;
  selectedContacts?: Contact[];
  multiSelect?: boolean;
  title?: string;
  filterSource?: ContactSource;
}

export const ContactPicker: React.FC<ContactPickerProps> = ({
  visible,
  onClose,
  onSelect,
  selectedContacts = [],
  multiSelect = true,
  title = '选择联系人',
  filterSource,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // 加载联系人
  useEffect(() => {
    if (visible) {
      void loadContacts();
      
      // 初始化已选中的联系人
      const selectedIds = new Set(
        selectedContacts
          .filter(c => c.id)
          .map(c => c.id!)
      );
      setSelected(selectedIds);
    }
  }, [visible, searchQuery, filterSource]);

  const loadContacts = async () => {
    if (searchQuery.trim()) {
      const results = await ContactService.searchContacts(searchQuery, filterSource);
      setContacts(results);
    } else {
      const allContacts = await ContactService.getAllContacts();
      const filtered = filterSource
        ? allContacts.filter(c => {
            switch (filterSource) {
              case '4dnote': return c.is4DNote;
              case 'outlook': return c.isOutlook;
              case 'google': return c.isGoogle;
              case 'icloud': return c.isiCloud;
              default: return true;
            }
          })
        : allContacts;
      setContacts(filtered);
    }
  };

  const handleToggleContact = (contactId: string) => {
    if (!multiSelect) {
      // 单选模式
      setSelected(new Set([contactId]));
    } else {
      // 多选模式
      const newSelected = new Set(selected);
      if (newSelected.has(contactId)) {
        newSelected.delete(contactId);
      } else {
        newSelected.add(contactId);
      }
      setSelected(newSelected);
    }
  };

  const handleConfirm = () => {
    const selectedContacts = contacts.filter(c => c.id && selected.has(c.id));
    onSelect(selectedContacts);
    onClose();
  };

  const getSourceTag = (contact: Contact) => {
    const source = ContactService.getSourceLabel(contact);
    const colorMap: Record<string, string> = {
      'ReMarkable': 'blue',
      'Outlook': 'orange',
      'Google': 'red',
      'iCloud': 'cyan',
    };
    return <Tag color={colorMap[source] || 'default'}>{source}</Tag>;
  };

  return (
    <Modal
      title={title}
      open={visible}
      onCancel={onClose}
      onOk={handleConfirm}
      width={600}
      okText="确认"
      cancelText="取消"
      okButtonProps={{ disabled: selected.size === 0 }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索姓名、邮箱或组织"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          allowClear
        />

        <div style={{ fontSize: '12px', color: '#666' }}>
          已选择 {selected.size} 个联系人
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {contacts.length === 0 ? (
            <Empty description="没有找到联系人" />
          ) : (
            <List
              dataSource={contacts}
              renderItem={contact => (
                <List.Item
                  key={contact.id}
                  onClick={() => contact.id && handleToggleContact(contact.id)}
                  style={{ cursor: 'pointer', padding: '12px 0' }}
                >
                  <List.Item.Meta
                    avatar={
                      <Space>
                        {multiSelect && (
                          <Checkbox
                            checked={contact.id ? selected.has(contact.id) : false}
                            onChange={() => contact.id && handleToggleContact(contact.id)}
                          />
                        )}
                        <Avatar contact={contact} size={40} />
                      </Space>
                    }
                    title={
                      <Space>
                        <span>{contact.name || '未命名'}</span>
                        {getSourceTag(contact)}
                      </Space>
                    }
                    description={
                      <div>
                        {contact.email && <div>{contact.email}</div>}
                        {contact.organization && (
                          <div style={{ color: '#999', fontSize: '12px' }}>
                            {contact.organization}
                          </div>
                        )}
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </div>

        <Button
          type="dashed"
          block
          icon={<UserAddOutlined />}
          onClick={() => {
            // TODO: 打开添加联系人对话框
            console.log('添加新联系人');
          }}
        >
          添加新联系人
        </Button>
      </Space>
    </Modal>
  );
};

/**
 * 快速添加联系人对话框
 */
interface QuickAddContactProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (contact: Contact) => void;
}

export const QuickAddContact: React.FC<QuickAddContactProps> = ({
  visible,
  onClose,
  onAdd,
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    organization: '',
  });

  const handleSubmit = async () => {
    if (!formData.name && !formData.email) {
      return;
    }

    const newContact = await ContactService.addContact({
      ...formData,
      is4DNote: true,
    });

    onAdd(newContact);
    setFormData({ name: '', email: '', phone: '', organization: '' });
    onClose();
  };

  return (
    <Modal
      title="添加联系人"
      open={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okText="添加"
      cancelText="取消"
      okButtonProps={{ disabled: !formData.name && !formData.email }}
    >
      <Space direction="vertical" style={{ width: '100%' }} size="middle">
        <div>
          <label>姓名</label>
          <Input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="请输入姓名"
          />
        </div>
        <div>
          <label>邮箱 *</label>
          <Input
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="请输入邮箱"
            type="email"
          />
        </div>
        <div>
          <label>电话</label>
          <Input
            value={formData.phone}
            onChange={e => setFormData({ ...formData, phone: e.target.value })}
            placeholder="请输入电话"
          />
        </div>
        <div>
          <label>组织</label>
          <Input
            value={formData.organization}
            onChange={e => setFormData({ ...formData, organization: e.target.value })}
            placeholder="请输入组织/公司"
          />
        </div>
      </Space>
    </Modal>
  );
};
