import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CalendarGroup, Calendar } from '@backend/MicrosoftCalendarService';
import '@frontend/features/Calendar/styles/CalendarGroupManager.css';

interface CalendarGroupManagerProps {
  microsoftService: any; // MicrosoftCalendarService实例
  isOpen: boolean;
  onClose: () => void;
}

const CalendarGroupManager: React.FC<CalendarGroupManagerProps> = ({
  microsoftService,
  isOpen,
  onClose
}) => {
  const [calendarGroups, setCalendarGroups] = useState<CalendarGroup[]>([]);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [showCreateGroupForm, setShowCreateGroupForm] = useState(false);
  const [showCreateCalendarForm, setShowCreateCalendarForm] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newCalendarName, setNewCalendarName] = useState('');
  const [newCalendarColor, setNewCalendarColor] = useState('#1f77b4');

  useEffect(() => {
    if (isOpen && microsoftService) {
      loadCalendarData();
    }
  }, [isOpen, microsoftService]);

  const loadCalendarData = async () => {
    setLoading(true);
    setError('');
    try {
      // 加载日历分组
      const groups = await microsoftService.getCalendarGroups();
      setCalendarGroups(groups);

      // 加载所有日历
      const allCalendars = await microsoftService.getAllCalendars();
      setCalendars(allCalendars);

      // 获取当前选择的日历
      const currentSelected = microsoftService.getSelectedCalendarId();
      if (currentSelected) {
        setSelectedCalendarId(currentSelected);
      }
    } catch (err: any) {
      setError(`加载日历数据失败: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setError('请输入分组名称');
      return;
    }

    try {
      await microsoftService.createCalendarGroup(newGroupName.trim());
      setNewGroupName('');
      setShowCreateGroupForm(false);
      await loadCalendarData();
    } catch (err: any) {
      setError(`创建分组失败: ${err.message}`);
    }
  };

  const handleCreateCalendar = async () => {
    if (!newCalendarName.trim()) {
      setError('请输入日历名称');
      return;
    }

    if (!selectedGroupId) {
      setError('请先选择一个分组');
      return;
    }

    try {
      await microsoftService.createCalendarInGroup(
        selectedGroupId, 
        newCalendarName.trim(), 
        newCalendarColor
      );
      setNewCalendarName('');
      setNewCalendarColor('#1f77b4');
      setShowCreateCalendarForm(false);
      await loadCalendarData();
    } catch (err: any) {
      setError(`创建日历失败: ${err.message}`);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('确定要删除这个日历分组吗？这将删除分组下的所有日历！')) {
      return;
    }

    try {
      await microsoftService.deleteCalendarGroup(groupId);
      await loadCalendarData();
    } catch (err: any) {
      setError(`删除分组失败: ${err.message}`);
    }
  };

  const handleSelectCalendar = (calendarId: string) => {
    setSelectedCalendarId(calendarId);
    microsoftService.setSelectedCalendar(calendarId);
  };

  const getCalendarsForGroup = async (groupId: string) => {
    try {
      const groupCalendars = await microsoftService.getCalendarsInGroup(groupId);
      return groupCalendars;
    } catch (err) {
      console.error('获取分组日历失败:', err);
      return [];
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="calendar-group-overlay" onClick={onClose}>
      <div className="calendar-group-modal" onClick={e => e.stopPropagation()}>
        <div className="calendar-group-header">
          <h3>📅 Outlook 日历管理</h3>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="calendar-group-content">
          {loading && <div className="loading">正在加载日历数据...</div>}
          {error && <div className="error-message">{error}</div>}

          {/* 所有日历列表 */}
          <div className="section">
            <div className="section-header">
              <h4>可用日历</h4>
              <span className="calendar-count">{calendars.length} 个日历</span>
            </div>
            
            <div className="calendars-list">
              {calendars.map(calendar => (
                <div 
                  key={calendar.id} 
                  className={`calendar-item ${selectedCalendarId === calendar.id ? 'selected' : ''}`}
                  onClick={() => handleSelectCalendar(calendar.id!)}
                >
                  <div className="calendar-info">
                    <div 
                      className="calendar-color" 
                      style={{ backgroundColor: calendar.color || '#1f77b4' }}
                    ></div>
                    <span className="calendar-name">{calendar.name}</span>
                    {selectedCalendarId === calendar.id && (
                      <span className="selected-badge">默认同步</span>
                    )}
                  </div>
                  <div className="calendar-meta">
                    {calendar.canEdit && <span className="capability">可编辑</span>}
                    {calendar.canShare && <span className="capability">可分享</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 日历分组管理 */}
          <div className="section">
            <div className="section-header">
              <h4>日历分组</h4>
              <button 
                className="btn btn-primary-small"
                onClick={() => setShowCreateGroupForm(true)}
              >
                新建分组
              </button>
            </div>

            {showCreateGroupForm && (
              <div className="create-form">
                <input
                  type="text"
                  placeholder="输入分组名称"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleCreateGroup()}
                />
                <div className="form-actions">
                  <button onClick={handleCreateGroup} className="btn btn-primary">创建</button>
                  <button onClick={() => setShowCreateGroupForm(false)} className="btn btn-secondary">取消</button>
                </div>
              </div>
            )}

            <div className="calendar-groups-list">
              {calendarGroups.map(group => (
                <div key={group.id} className="calendar-group-item">
                  <div className="group-header">
                    <span className="group-name">{group.name}</span>
                    <div className="group-actions">
                      <button 
                        className="btn btn-secondary-small"
                        onClick={() => {
                          setSelectedGroupId(group.id!);
                          setShowCreateCalendarForm(true);
                        }}
                      >
                        添加日历
                      </button>
                      <button 
                        className="btn btn-danger-small"
                        onClick={() => handleDeleteGroup(group.id!)}
                      >
                        删除分组
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showCreateCalendarForm && (
              <div className="create-form">
                <h5>在分组中创建新日历</h5>
                <input
                  type="text"
                  placeholder="输入日历名称"
                  value={newCalendarName}
                  onChange={(e) => setNewCalendarName(e.target.value)}
                />
                <div className="color-picker">
                  <label>日历颜色:</label>
                  <input
                    type="color"
                    value={newCalendarColor}
                    onChange={(e) => setNewCalendarColor(e.target.value)}
                  />
                </div>
                <div className="form-actions">
                  <button onClick={handleCreateCalendar} className="btn btn-primary">创建日历</button>
                  <button onClick={() => setShowCreateCalendarForm(false)} className="btn btn-secondary">取消</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="calendar-group-footer">
          <div className="selected-info">
            {selectedCalendarId && (
              <span>默认同步日历: {calendars.find(c => c.id === selectedCalendarId)?.name || '未知'}</span>
            )}
          </div>
          <button className="btn btn-primary" onClick={onClose}>
            完成设置
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CalendarGroupManager;