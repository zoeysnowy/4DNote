/**
 * AttendeeDisplay - 参会人显示组件
 * 
 * 功能：
 * - 显示发起人和参会人列表
 * - 发起人样式：斜体 + 加粗 + 下划线
 * - 有邮箱的参会人：下划线
 * - 点击展开多来源搜索
 * - 悬浮预览联系人信息
 * - 键盘导航支持
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Tippy from '@tippyjs/react';
import 'tippy.js/dist/tippy.css';
import { Contact, Event } from '@frontend/types';
import { ContactService } from '@backend/ContactService';
import { EventService } from '@backend/EventService';
import AttendeeIcon from '@frontend/assets/icons/Attendee.svg';
import EditIcon from '@frontend/assets/icons/Edit.svg';
import './AttendeeDisplay.css';

interface AttendeeDisplayProps {
  event: Event;
  currentUserEmail?: string;
  onChange?: (attendees: Contact[], organizer?: Contact) => void;
}

export const AttendeeDisplay: React.FC<AttendeeDisplayProps> = ({
  event,
  currentUserEmail = '',
  onChange,
}) => {
  const [participants, setParticipants] = useState<Contact[]>([]);
  const [editableText, setEditableText] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [fullContactModal, setFullContactModal] = useState<{ 
    visible: boolean; 
    contact?: Contact; 
    triggerElement?: HTMLElement; // 原始触发元素（参会人名字/搜索项）
    placement?: 'top' | 'bottom';
    fromSearch?: boolean;
  }>({ visible: false });
  const [tippyInstances, setTippyInstances] = useState<Map<string, any>>(new Map());
  
  const editableRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const hasInitializedRef = useRef(false);
  const initializedFromPropsRef = useRef(false);
  const contactEditableRef = useRef<HTMLDivElement>(null); // 联系人编辑区域 ref
  const modalTriggerRef = useRef<HTMLSpanElement>(null); // Modal 虚拟触发元素

  // 组件挂载/卸载日志
  useEffect(() => {
    console.log('[AttendeeDisplay] 🎬 组件已挂载');
    return () => {
      console.log('[AttendeeDisplay] 💀 组件已卸载');
    };
  }, []);

  // 初始化参会人列表（仅在组件挂载时从 props 读取一次）
  useEffect(() => {
    if (initializedFromPropsRef.current) return; // 已初始化过，跳过
    
    // 🔧 修复：getAllContacts() 是异步方法，必须 await
    const initializeParticipants = async () => {
      const newParticipants: Contact[] = [];
      
      // 辅助函数：通过多种方式查找联系人（异步）
      const findContactInService = async (contact: Contact): Promise<Contact | null> => {
        const allContacts = await ContactService.getAllContacts();
        
        // 1. 优先通过 ID 精确匹配
        if (contact.id) {
          const foundById = allContacts.find(c => c.id === contact.id);
          if (foundById) return foundById;
        }
        
        // 2. 通过邮箱匹配（如果有邮箱）
        if (contact.email) {
          const foundByEmail = allContacts.find(c => 
            c.email?.toLowerCase() === contact.email?.toLowerCase()
          );
          if (foundByEmail) return foundByEmail;
        }
        
        // 3. 通过姓名 + 组织匹配（避免同名不同人）
        if (contact.name && contact.organization) {
          const foundByNameOrg = allContacts.find(c => 
            c.name === contact.name && c.organization === contact.organization
          );
          if (foundByNameOrg) return foundByNameOrg;
        }
        
        // 4. 仅通过姓名匹配（最后的手段，可能不准确）
        if (contact.name) {
          const foundByName = allContacts.find(c => c.name === contact.name);
          if (foundByName) return foundByName;
        }
        
        return null;
      };
      
      // 1. 添加发起人
      if (event.organizer) {
        const fullOrganizer = await findContactInService(event.organizer) || event.organizer;
        if (fullOrganizer !== event.organizer) {
          console.log('[AttendeeDisplay] ✅ 找到发起人完整数据:', { 
            name: fullOrganizer.name, 
            matchedBy: fullOrganizer.email ? 'email' : 'name'
          });
        }
        newParticipants.push(fullOrganizer);
      } else if (event.attendees?.some(a => a.email)) {
        // 用户自己创建的事件，有邮箱的参会人 → 发起人 = 用户自己
        newParticipants.push({
          id: 'current-user',
          name: '我',
          email: currentUserEmail,
          is4DNote: true,
        });
      }
      
      // 2. 添加参会人
      if (event.attendees) {
        const fullAttendees = await Promise.all(
          event.attendees.map(async (attendee) => {
            const fullContact = await findContactInService(attendee) || attendee;
            if (fullContact !== attendee) {
              console.log('[AttendeeDisplay] ✅ 找到参会人完整数据:', { 
                name: fullContact.name,
                hasPhone: !!fullContact.phone,
                matchedBy: fullContact.email ? 'email' : 'name'
              });
            }
            return fullContact;
          })
        );
        newParticipants.push(...fullAttendees);
      }
      
      console.log('[AttendeeDisplay] 📋 初始化参会人列表（已获取完整数据）:', {
        count: newParticipants.length,
        participants: newParticipants.map(p => ({ 
          name: p.name, 
          id: p.id,
          hasPhone: !!p.phone, 
          hasOrganization: !!p.organization 
        }))
      });
      
      setParticipants(newParticipants);
      
      // 初始化可编辑文本
      const text = newParticipants.map(p => p.name).join('; ');
      setEditableText(text);
      
      initializedFromPropsRef.current = true; // 标记已初始化
    };
    
    initializeParticipants();
  }, []); // 空依赖，只在挂载时运行一次

  // 监控 participants 状态变化
  useEffect(() => {
    console.log('[AttendeeDisplay] 📊 participants 状态已更新:', {
      count: participants.length,
      names: participants.map(p => p.name),
      editableText,
    });
  }, [participants]);

  // 订阅 ContactService 事件，自动同步联系人变更
  useEffect(() => {
    const handleContactUpdated = (event: any) => {
      const { id, after } = event.data;
      console.log('[AttendeeDisplay] 📇 收到联系人更新事件:', { id, after });
      
      // 自动更新 participants 数组中的联系人
      setParticipants(prev => {
        const updated = prev.map(p => p.id === id ? after : p);
        const hasChanges = updated.some((p, i) => p !== prev[i]);
        
        if (hasChanges) {
          console.log('[AttendeeDisplay] ✅ 已自动更新 participants 中的联系人');
          
          // 同步更新可编辑文本
          const newText = updated.map(p => p.name).join('; ');
          setEditableText(newText);
          
          // 触发 onChange 回调
          if (onChange) {
            const organizer = updated[0];
            const attendees = updated.slice(1);
            onChange(attendees, organizer);
          }
        }
        
        return updated;
      });
    };

    const handleContactDeleted = (event: any) => {
      const { id } = event.data;
      console.log('[AttendeeDisplay] 🗑️ 收到联系人删除事件:', { id });
      
      // 从 participants 数组中移除该联系人
      setParticipants(prev => {
        const filtered = prev.filter(p => p.id !== id);
        
        if (filtered.length !== prev.length) {
          console.log('[AttendeeDisplay] ✅ 已从 participants 中移除联系人');
          
          // 同步更新可编辑文本
          const newText = filtered.map(p => p.name).join('; ');
          setEditableText(newText);
          
          // 触发 onChange 回调
          if (onChange) {
            const organizer = filtered[0];
            const attendees = filtered.slice(1);
            onChange(attendees, organizer);
          }
        }
        
        return filtered;
      });
      
      // 如果当前打开的 Modal 是被删除的联系人，关闭 Modal
      if (fullContactModal.visible && fullContactModal.contact?.id === id) {
        console.log('[AttendeeDisplay] 🚪 关闭已删除联系人的 Modal');
        setFullContactModal({ visible: false });
      }
    };

    ContactService.addEventListener('contact.updated', handleContactUpdated);
    ContactService.addEventListener('contact.deleted', handleContactDeleted);

    console.log('[AttendeeDisplay] 🔔 已订阅 ContactService 事件');

    return () => {
      ContactService.removeEventListener('contact.updated', handleContactUpdated);
      ContactService.removeEventListener('contact.deleted', handleContactDeleted);
      console.log('[AttendeeDisplay] 🔕 已取消订阅 ContactService 事件');
    };
  }, [onChange, fullContactModal.visible, fullContactModal.contact?.id]);

  // 从可编辑文本解析参会人
  const parseParticipantsFromText = (text: string): Contact[] => {
    const names = text
      .split(/[;；]/)
      .map(n => n.trim())
      .filter(n => n.length > 0);
    
    return names.map(name => {
      // 尝试从现有参会人中找到匹配
      const existing = participants.find(p => p.name === name);
      if (existing) {
        // 直接使用 existing，因为 participants 数组已通过事件订阅自动保持最新
        return existing;
      }
      
      // 创建新联系人
      return {
        id: `temp-${Date.now()}-${Math.random()}`,
        name,
        is4DNote: true,
      };
    });
  };

  // 搜索联系人（多来源合并 + 按优先级显示）
  const searchContacts = async (query: string): Promise<Contact[]> => {
    if (!query.trim()) return [];
    
    console.log(`[AttendeeDisplay] 开始搜索: "${query}"`);
    
    // 搜索所有来源
    const platformContacts = ContactService.searchPlatformContacts(query);
    const localContacts = ContactService.searchLocalContacts(query);
    const historicalContacts = await EventService.searchHistoricalParticipants(query);
    
    // 使用 ContactService 的去重逻辑
    const mergedContacts = ContactService.mergeContactSources([
      ...platformContacts,
      ...localContacts,
      ...historicalContacts,
    ]);
    
    console.log(`[AttendeeDisplay] 搜索结果: ${mergedContacts.length} 个联系人`);
    
    return mergedContacts;
  };

  // 格式化来源标签
  const formatSource = (contact: Contact): string => {
    if (contact.isOutlook) return 'Outlook 联系人';
    if (contact.isGoogle) return 'Google 联系人';
    if (contact.isiCloud) return 'iCloud 联系人';
    if (contact.is4DNote) return '4DNote 联系人';
    return '历史参会人';
  };

  // 保存和恢复光标位置
  const saveCursorPosition = () => {
    const selection = window.getSelection();
    if (!selection || !editableRef.current) return null;
    
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editableRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  const restoreCursorPosition = (position: number) => {
    if (!editableRef.current) return;
    
    const selection = window.getSelection();
    const range = document.createRange();
    
    let currentPos = 0;
    const walker = document.createTreeWalker(
      editableRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );
    
    let node: Node | null;
    while (node = walker.nextNode()) {
      const nodeLength = node.textContent?.length || 0;
      if (currentPos + nodeLength >= position) {
        range.setStart(node, position - currentPos);
        range.setEnd(node, position - currentPos);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }
      currentPos += nodeLength;
    }
  };

  // 文本输入变化
  const handleTextInput = (e: React.FormEvent<HTMLDivElement>) => {
    const text = e.currentTarget.textContent || '';
    
    setEditableText(text);
    
    // 提取最后一个词进行搜索
    const lastWord = text.split(/[;；]/).pop()?.trim() || '';
    setSearchQuery(lastWord);
    
    if (lastWord.length > 0) {
      searchContacts(lastWord).then(results => {
        setSearchResults(results);
        setSelectedIndex(0);
      });
    } else {
      setSearchResults([]);
    }
  };

  // 聚焦时进入编辑模式
  const handleFocus = () => {
    console.log('[AttendeeDisplay] 👆 用户点击进入编辑模式', {
      currentParticipants: participants.map(p => p.name),
      isEditing,
      editableRefContent: editableRef.current?.textContent,
    });
    
    // ✅ 不在这里初始化内容！让 useEffect 负责首次初始化
    // 这里只负责：
    // 1. 切换到编辑模式
    // 2. 聚焦光标到末尾（如果 DOM 已有内容）
    
    setIsEditing(true);
    
    // 延迟执行光标定位（等待 React 更新完成）
    setTimeout(() => {
      if (editableRef.current && editableRef.current.textContent) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }, 0);
  };

  // 失焦时退出编辑模式
  const handleBlur = () => {
    // ✅ 直接从 DOM 读取最新内容，不依赖状态
    const currentDOMText = editableRef.current?.textContent || '';
    
    console.log('[AttendeeDisplay] 🔍 失焦，当前 DOM 文本:', currentDOMText);
    
    setIsEditing(false);
    
    // 比较 DOM 文本是否与 participants 状态不同
    const currentText = participants.map(p => p.name).join('; ');
    const hasChanged = currentDOMText.trim() !== currentText.trim();
    
    console.log('[AttendeeDisplay] 检查是否变化:', {
      currentParticipants: currentText,
      editedDOMText: currentDOMText,
      hasChanged,
    });
    
    if (hasChanged) {
      // 解析文本并更新参会人列表
      const updatedParticipants = parseParticipantsFromText(currentDOMText);
      
      console.log('[AttendeeDisplay] ✏️ 解析参会人:', {
        parsedCount: updatedParticipants.length,
        parsedNames: updatedParticipants.map(p => p.name),
      });
      
      console.log('[AttendeeDisplay] 🔄 即将更新 participants 状态:', {
        旧值: participants.map(p => p.name),
        新值: updatedParticipants.map(p => p.name),
      });
      
      setParticipants(updatedParticipants);
      
      // 🆕 自动保存新联系人到 localStorage
      updatedParticipants.forEach(contact => {
        if (contact.id?.startsWith('temp-')) {
          // 这是新创建的联系人，保存到 localStorage
          const { id, ...contactWithoutId } = contact;
          const savedContact = ContactService.saveContact(contactWithoutId);
          console.log('[AttendeeDisplay] 💾 已保存新联系人:', savedContact);
        }
      });
      
      if (onChange) {
        const organizer = updatedParticipants[0];
        const attendees = updatedParticipants.slice(1);
        onChange(attendees, organizer);
        console.log('[AttendeeDisplay] 📤 已调用 onChange');
      }
    } else {
      console.log('[AttendeeDisplay] ⏭️ 内容未变化，跳过更新');
    }
    
    // 🔍 添加延迟日志，查看退出编辑后的状态
    setTimeout(() => {
      console.log('[AttendeeDisplay] 📤 已退出编辑模式，当前状态:', {
        isEditing: false,
        participants数量: participants.length,
        participants名单: participants.map(p => p.name),
      });
    }, 100);
  };

  // 初始化编辑框内容（仅在切换到编辑模式时）
  useEffect(() => {
    if (isEditing && editableRef.current && !hasInitializedRef.current) {
      const text = participants.map(p => p.name).join('; ');
      
      console.log('[AttendeeDisplay] 🔄 初始化编辑框:', {
        participantsCount: participants.length,
        participantsNames: participants.map(p => p.name),
        generatedText: text,
        currentTextContent: editableRef.current.textContent,
      });
      
      // 清空后再设置，避免重复
      editableRef.current.textContent = '';
      editableRef.current.textContent = text;
      setEditableText(text);
      hasInitializedRef.current = true;
      
      console.log('[AttendeeDisplay] ✅ 编辑框已初始化:', editableRef.current.textContent);
      
      // 聚焦到末尾
      const range = document.createRange();
      const selection = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    
    // 退出编辑模式时重置标志
    if (!isEditing) {
      console.log('[AttendeeDisplay] 📤 退出编辑模式，重置初始化标志');
      hasInitializedRef.current = false;
    }
  }, [isEditing]); // 移除 participants 依赖，避免失焦后重复触发

  // 点击参会人名字查看详情
  const handleClickParticipant = (person: Contact, e: React.MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    console.log('[AttendeeDisplay] 点击参会人:', person);
    
    // 获取 Tippy 实例并记录 placement
    const instance = tippyInstances.get(person.id || '');
    let placement: 'top' | 'bottom' = 'top';
    
    if (instance) {
      // 获取 Tippy 的实际 placement
      const computedPlacement = instance.popper?.getAttribute('data-placement') || instance.props.placement;
      placement = computedPlacement?.startsWith('bottom') ? 'bottom' : 'top';
      instance.hide();
    }
    
    // 存储触发元素（参会人名字）
    const triggerElement = e.currentTarget;
    
    console.log('[AttendeeDisplay] 🎯 预览卡片打开 Modal，联系人数据:', {
      name: person.name,
      id: person.id,
      email: person.email,
      phone: person.phone,
      organization: person.organization,
      source: person.isOutlook ? 'Outlook' : person.isGoogle ? 'Google' : person.isiCloud ? 'iCloud' : person.is4DNote ? 'ReMarkable' : 'Unknown'
    });
    
    // 打开完整联系人 Modal（person 已通过事件订阅自动保持最新）
    setFullContactModal({ visible: true, contact: person, triggerElement, placement });
  };

  // 选择联系人
  const handleSelectContact = (contact: Contact) => {
    // 替换最后一个词
    const words = editableText.split(/[;；]/);
    if (words.length > 0) {
      words[words.length - 1] = contact.name || '';
    }
    const newText = words.join('; ') + '; ';
    
    setEditableText(newText);
    setSearchResults([]);
    setSearchQuery('');
    
    // 更新 contentEditable
    if (editableRef.current) {
      editableRef.current.textContent = newText;
      // 将光标移到末尾
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editableRef.current);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  };

  // 键盘交互
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (searchResults.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, searchResults.length - 1));
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
          break;
          
        case 'Enter':
          e.preventDefault();
          if (searchResults[selectedIndex]) {
            handleSelectContact(searchResults[selectedIndex]);
          }
          break;
          
        case 'Escape':
          setSearchResults([]);
          break;
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      console.log('[AttendeeDisplay] ⏎ 用户按下 Enter 键，触发 handleBlur');
      // Enter 提交更改
      handleBlur();
    }
  };

  // 点击外部关闭编辑
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (editableRef.current && !editableRef.current.contains(e.target as Node) &&
          dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        handleBlur();
      }
    };
    
    if (isEditing) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isEditing, editableText]);

  return (
    <div className="attendee-display">
      <img src={AttendeeIcon} alt="参会人" className="attendee-icon" />
      
      {/* 双模式渲染：编辑时用 contentEditable，查看时用带 Tippy 的文本 */}
      <div className="attendee-input-container">
        {isEditing ? (
          // 编辑模式 - 不通过 React children 控制内容，避免光标跳跃
          <div
            key="edit-mode"
            ref={editableRef}
            contentEditable
            suppressContentEditableWarning
            className="attendee-text-input"
            onInput={handleTextInput}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
          />
        ) : (
          // 查看模式：带 Tippy 悬浮预览
          <div
            key="view-mode"
            className="attendee-text-display"
            onClick={() => {
              console.log('[AttendeeDisplay] 🖱️ 点击进入编辑模式（从 view 模式）', {
                当前participants数量: participants.length,
                当前participants名单: participants.map(p => p.name),
              });
              setIsEditing(true);
            }}
          >
            {(() => {
              console.log('[AttendeeDisplay] 📺 VIEW 模式渲染', {
                participants数量: participants.length,
                participants名单: participants.map(p => p.name),
                即将渲染的人数: participants.length,
              });
              return null;
            })()}
            {participants.length > 0 ? (
              participants.map((person, index) => {
                const contactCard = (
                  <div className="contact-preview-card" onClick={(e) => e.stopPropagation()}>
                    <div className="preview-header">
                      <div className="preview-name-row">
                        <img 
                          src={EditIcon} 
                          alt="编辑" 
                          className="edit-icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('[AttendeeDisplay] 🖊️ 预览卡片编辑图标点击，联系人:', person.name);
                            
                            // 获取 Tippy 实例并记录 placement
                            const instance = tippyInstances.get(person.id || '');
                            let placement: 'top' | 'bottom' = 'top';
                            
                            if (instance) {
                              // 获取 Tippy 的实际 placement
                              const computedPlacement = instance.popper?.getAttribute('data-placement') || instance.props.placement;
                              placement = computedPlacement?.startsWith('bottom') ? 'bottom' : 'top';
                              instance.hide();
                            }
                            
                            // 找到参会人名字元素（Tippy 的原始 reference）
                            const triggerElement = instance?.reference as HTMLElement;
                            
                            console.log('[AttendeeDisplay] 🎯 预览卡片打开 Modal，联系人数据:', {
                              name: person.name,
                              id: person.id,
                              email: person.email,
                              phone: person.phone,
                              organization: person.organization,
                              position: person.position,
                              source: person.isOutlook ? 'Outlook' : person.isGoogle ? 'Google' : person.isiCloud ? 'iCloud' : person.is4DNote ? 'ReMarkable' : 'Unknown'
                            });
                            
                            // 打开完整 Modal（person 已通过事件订阅自动保持最新）
                            setFullContactModal({ visible: true, contact: person, triggerElement, placement });
                          }}
                        />
                        <div className="preview-name">{person.name}</div>
                      </div>
                      <div className="preview-source">
                        {formatSource(person)}
                      </div>
                    </div>
                    {person.email && (
                      <div className="preview-row">
                        <span className="preview-label">邮箱:</span>
                        <span className="preview-value">{person.email}</span>
                      </div>
                    )}
                    {person.phone && (
                      <div className="preview-row">
                        <span className="preview-label">电话:</span>
                        <span className="preview-value">{person.phone}</span>
                      </div>
                    )}
                    {person.organization && (
                      <div className="preview-row">
                        <span className="preview-label">组织:</span>
                        <span className="preview-value">{person.organization}</span>
                      </div>
                    )}
                  </div>
                );

                return (
                  <React.Fragment key={person.id}>
                    <Tippy 
                      content={contactCard} 
                      delay={1000} 
                      placement="top"
                      interactive={true}
                      arrow={true}
                      maxWidth={350}
                      onCreate={(instance) => {
                        // 保存 Tippy 实例，用于后续控制
                        setTippyInstances(prev => {
                          const newMap = new Map(prev);
                          newMap.set(person.id || '', instance);
                          return newMap;
                        });
                      }}
                      onDestroy={() => {
                        // 清理 Tippy 实例
                        setTippyInstances(prev => {
                          const newMap = new Map(prev);
                          newMap.delete(person.id || '');
                          return newMap;
                        });
                      }}
                    >
                      <span
                        className={`participant-name ${index === 0 ? 'organizer' : ''}`}
                        onClick={(e) => handleClickParticipant(person, e)}
                      >
                        {person.name}
                      </span>
                    </Tippy>
                    {index < participants.length - 1 && <span className="separator">; </span>}
                  </React.Fragment>
                );
              })
            ) : (
              <span className="placeholder-text">添加参会人...</span>
            )}
          </div>
        )}
      </div>

      {/* 完整联系人编辑 Modal */}
      {fullContactModal.visible && fullContactModal.contact && fullContactModal.triggerElement && (() => {
        const contact = fullContactModal.contact;
        const triggerElement = fullContactModal.triggerElement;
        
        // 保存初始值，用于比较是否有变化
        const initialValues = {
          name: contact.name || '',
          email: contact.email || '',
          phone: contact.phone || '',
          organization: contact.organization || '',
        };
        
        const modalContent = (
          <div 
            className="full-contact-modal"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setFullContactModal({ visible: false });
              } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                // 手动触发 blur 保存
                if (contactEditableRef.current) {
                  contactEditableRef.current.blur();
                }
                setTimeout(() => {
                  setFullContactModal({ visible: false });
                }, 50);
              }
            }}
          >
            <div className="modal-header">
              <div className="modal-header-left">
                <h3>联系人信息</h3>
                <span className="modal-hint">点击编辑信息</span>
              </div>
              <button 
                className="close-btn"
                onClick={() => setFullContactModal({ visible: false })}
              >
                ✕
              </button>
            </div>
              
              <div 
                ref={contactEditableRef}
                className="modal-body-editable"
                contentEditable
                suppressContentEditableWarning
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
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
                    
                    // 找到当前所在的行（.contact-field）
                    const currentField = (currentNode as Element).closest('.contact-field');
                    if (!currentField) return;
                    
                    // 找到下一个 .contact-field
                    const nextField = currentField.nextElementSibling;
                    if (!nextField || !nextField.classList.contains('contact-field')) return;
                    
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
                    
                    console.log('[AttendeeDisplay] ✅ Enter 键跳转到下一个字段');
                  }
                }}
                onBlur={(e) => {
                  console.log('[AttendeeDisplay] 📝 onBlur 触发');
                  
                  // 提取各个字段的值
                  const fields = e.currentTarget.querySelectorAll('.contact-field');
                  const updated = { ...fullContactModal.contact! };
                  let hasChanges = false;
                  
                  console.log('[AttendeeDisplay] 初始值:', initialValues);
                  
                  fields.forEach((field) => {
                    const label = field.querySelector('.contact-label')?.textContent?.replace('：', '').trim();
                    const valueElement = field.querySelector('.contact-value');
                    const value = valueElement?.textContent?.trim() || '';
                    
                    console.log(`[AttendeeDisplay] 字段 ${label}: "${value}" (初始值: "${initialValues[label === '姓名' ? 'name' : label === '邮箱' ? 'email' : label === '电话' ? 'phone' : 'organization']}")`);
                    
                    if (label === '姓名' && value !== initialValues.name) {
                      console.log('[AttendeeDisplay] ✏️ 姓名变化:', initialValues.name, '->', value);
                      updated.name = value;
                      hasChanges = true;
                    } else if (label === '邮箱' && value !== initialValues.email) {
                      console.log('[AttendeeDisplay] ✏️ 邮箱变化:', initialValues.email, '->', value);
                      updated.email = value;
                      hasChanges = true;
                    } else if (label === '电话' && value !== initialValues.phone) {
                      console.log('[AttendeeDisplay] ✏️ 电话变化:', initialValues.phone, '->', value);
                      updated.phone = value;
                      hasChanges = true;
                    } else if (label === '组织' && value !== initialValues.organization) {
                      console.log('[AttendeeDisplay] ✏️ 组织变化:', initialValues.organization, '->', value);
                      updated.organization = value;
                      hasChanges = true;
                    }
                  });
                  
                  console.log('[AttendeeDisplay] hasChanges:', hasChanges);
                  
                  if (hasChanges) {
                    console.log('[AttendeeDisplay] 💾 保存联系人修改:', updated);
                    ContactService.updateContact(updated.id!, updated);
                    
                    // 更新 participants 列表（如果联系人在列表中）
                    setParticipants(prev => {
                      const index = prev.findIndex(p => p.id === updated.id);
                      if (index >= 0) {
                        // 联系人已在列表中，更新它
                        const newList = [...prev];
                        newList[index] = updated;
                        console.log('[AttendeeDisplay] ✅ 更新 participants 中的联系人');
                        return newList;
                      } else {
                        // 联系人不在列表中（通过搜索添加的新联系人）
                        console.log('[AttendeeDisplay] ℹ️ 联系人不在 participants 中，无需更新列表');
                        return prev;
                      }
                    });
                    
                    // 更新 Modal 状态以刷新显示
                    setFullContactModal({ 
                      visible: true, 
                      contact: updated, 
                      triggerElement, 
                      placement: fullContactModal.placement, 
                      fromSearch: fullContactModal.fromSearch 
                    });
                  } else {
                    console.log('[AttendeeDisplay] ⏭️ 无变化，跳过保存');
                  }
                }}
              >
                <div className="contact-field">
                  <span className="contact-label" contentEditable={false}>姓名：</span>
                  <span className="contact-value">{contact.name || ''}</span>
                </div>
                <div className="contact-field">
                  <span className="contact-label" contentEditable={false}>邮箱：</span>
                  <span className="contact-value">{contact.email || ''}</span>
                </div>
                <div className="contact-field">
                  <span className="contact-label" contentEditable={false}>电话：</span>
                  <span className="contact-value">{contact.phone || ''}</span>
                </div>
                <div className="contact-field">
                  <span className="contact-label" contentEditable={false}>组织：</span>
                  <span className="contact-value">{contact.organization || ''}</span>
                </div>
                <div className="contact-field">
                  <span className="contact-label" contentEditable={false}>来源：</span>
                  <span className="contact-value" contentEditable={false}>{formatSource(contact)}</span>
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  className="btn-delete"
                  onClick={() => {
                    if (confirm(`确定要删除联系人 "${fullContactModal.contact?.name}" 吗？`)) {
                      ContactService.deleteContact(fullContactModal.contact!.id!);
                      setFullContactModal({ visible: false });
                      // 从 participants 中移除
                      setParticipants(prev => prev.filter(p => p.id !== fullContactModal.contact!.id));
                    }
                  }}
                >
                  删除
                </button>
                <button 
                  className="btn-primary"
                  onClick={() => {
                    // 手动触发 blur 保存
                    if (contactEditableRef.current) {
                      contactEditableRef.current.blur();
                    }
                    setTimeout(() => {
                      setFullContactModal({ visible: false });
                    }, 50);
                  }}
                >
                  完成
                </button>
              </div>
            </div>
        );
        
        return (
          <>
            <div 
              className="full-contact-modal-backdrop" 
              onClick={() => setFullContactModal({ visible: false })}
            />
            <Tippy
              content={modalContent}
              visible={true}
              interactive={true}
              placement={fullContactModal.fromSearch ? 'bottom-start' : (fullContactModal.placement === 'bottom' ? 'bottom-start' : 'top-start')}
              arrow={false}
              offset={[0, 0]}
              maxWidth="none"
              appendTo={() => document.body}
              onClickOutside={() => setFullContactModal({ visible: false })}
              popperOptions={{
                modifiers: [
                  {
                    name: 'flip',
                    enabled: false, // 禁用自动翻转
                  },
                  {
                    name: 'preventOverflow',
                    enabled: false, // 禁用边界检测
                  },
                ],
              }}
              getReferenceClientRect={() => {
                // 直接使用触发元素的实时位置
                return triggerElement.getBoundingClientRect();
              }}
            >
              <span ref={modalTriggerRef} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }} />
            </Tippy>
          </>
        );
      })()}

      {/* 搜索下拉框 */}
      {isEditing && searchResults.length > 0 && (
        <div className="attendee-search-dropdown" ref={dropdownRef}>
          <div className="attendee-search-results">
            {searchResults.map((contact, index) => (
              <div
                key={index}
                className={`search-result-item ${index === selectedIndex ? 'selected' : ''}`}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="contact-info-row">
                  <div 
                    className="contact-name-row"
                    onMouseDown={(e) => {
                      e.preventDefault(); // 防止失焦
                      handleSelectContact(contact);
                    }}
                  >
                    <img 
                      src={EditIcon} 
                      alt="编辑" 
                      className="edit-icon-small"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        console.log('[AttendeeDisplay] 🖊️ 点击搜索项编辑图标，联系人:', contact.name);
                        
                        // 使用输入框容器（.attendee-display）作为触发元素
                        const container = (e.target as HTMLElement).closest('.attendee-display') as HTMLElement;
                        const triggerElement = container || editableRef.current;
                        
                        if (!triggerElement) {
                          console.error('[AttendeeDisplay] ❌ 未找到触发元素');
                          return;
                        }
                        
                        // 清空搜索结果
                        setSearchResults([]);
                        setIsEditing(false);
                        
                        console.log('[AttendeeDisplay] 🔍 搜索选择器打开 Modal，联系人数据:', {
                          name: contact.name,
                          id: contact.id,
                          email: contact.email,
                          phone: contact.phone,
                          organization: contact.organization,
                          source: contact.isOutlook ? 'Outlook' : contact.isGoogle ? 'Google' : contact.isiCloud ? 'iCloud' : contact.is4DNote ? 'ReMarkable' : 'Unknown'
                        });
                        
                        // 打开完整 Modal（如果联系人已在 participants 中，会通过事件自动同步）
                        setFullContactModal({ visible: true, contact, triggerElement, placement: 'bottom', fromSearch: true });
                      }}
                    />
                    <div className="contact-name">{contact.name || contact.email}</div>
                  </div>
                  <div className="contact-source">{formatSource(contact)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
