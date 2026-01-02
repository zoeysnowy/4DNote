/**
 * AI Event Extraction Demo Page
 * 
 * 独立的测试页面，用于验证 AI 事件提取功能的完整流程
 * 
 * 功能：
 * 1. 上传 PDF 或文本文件
 * 2. AI 自动提取事件信息
 * 3. 预览提取结果（Before/After）
 * 4. 编辑并创建事件
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { AIService } from '../services/ai/AIService';
import { AIConfigManager, APIPreset } from '../services/ai/AIConfig';
import { ExtractedEventInfo } from '../services/ai/AIProvider.interface';
import { EventService } from '../services/EventService';
import { Event } from '../types';
import { formatTimeForStorage } from '../utils/timeUtils';
import { checkProxyHealth } from '../utils/proxyHelper';
import './AIDemo.css';

export const AIDemo: React.FC = () => {
  // 配置状态
  const [config, setConfig] = useState(() => AIConfigManager.getConfig());
  const [showConfig, setShowConfig] = useState(false);
  const [apiKey, setApiKey] = useState(config.dashscopeApiKey || '');
  const [hunyuanSecretId, setHunyuanSecretId] = useState(config.hunyuanSecretId || '');
  const [hunyuanSecretKey, setHunyuanSecretKey] = useState(config.hunyuanSecretKey || '');
  const [provider, setProvider] = useState<'ollama' | 'dashscope' | 'hunyuan'>(
    config.provider as 'ollama' | 'dashscope' | 'hunyuan'
  );
  
  // 代理状态
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'running' | 'stopped'>('checking');
  const [proxyLogs, setProxyLogs] = useState<Array<{ type: 'info' | 'error'; message: string }>>([]);
  const [isStartingProxy, setIsStartingProxy] = useState(false);
  
  // 预设管理
  const [presets, setPresets] = useState<APIPreset[]>(() => AIConfigManager.getPresets());
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presetName, setPresetName] = useState('');
  
  // 状态管理
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractedInfo, setExtractedInfo] = useState<ExtractedEventInfo | null>(null);
  const [aiStatus, setAIStatus] = useState<string>('未检测');
  
  // 编辑状态
  const [editedTitle, setEditedTitle] = useState('');
  const [editedStartTime, setEditedStartTime] = useState('');
  const [editedEndTime, setEditedEndTime] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [editedAgenda, setEditedAgenda] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 监听 Electron 代理状态变化
  useEffect(() => {
    // 检查是否在 Electron 环境
    const electronAPI = window.electron || window.electronAPI;
    
    // 🔧 调试日志
    console.log('🔍 [AIDemo] Electron 环境检测:');
    console.log('  - window.electron:', window.electron);
    console.log('  - window.electronAPI:', window.electronAPI);
    console.log('  - electronAPI:', electronAPI);
    console.log('  - electronAPI?.invoke:', electronAPI?.invoke);
    console.log('  - 按钮显示条件:', !!(window.electron?.invoke || window.electronAPI?.invoke));
    
    if (electronAPI) {
      // 监听代理状态
      electronAPI.on('ai-proxy-status', (status: any) => {
        setProxyStatus(status.running ? 'running' : 'stopped');
      });
      
      // 监听代理日志
      electronAPI.on('ai-proxy-log', (log: any) => {
        setProxyLogs(prev => [...prev.slice(-50), log]); // 保留最近50条
      });
    }
    
    return () => {
      if (electronAPI?.removeAllListeners) {
        electronAPI.removeAllListeners('ai-proxy-status');
        electronAPI.removeAllListeners('ai-proxy-log');
      }
    };
  }, []);
  
  // 检查代理服务器状态（仅当选择腾讯混元时）
  useEffect(() => {
    if (provider === 'hunyuan') {
      checkProxyStatus();
    } else {
      setProxyStatus('running'); // 其他provider不需要代理
    }
  }, [provider]);
  
  const checkProxyStatus = async () => {
    setProxyStatus('checking');
    
    // 如果在 Electron 环境，先检查进程状态
    const electronAPI = window.electron || window.electronAPI;
    
    if (electronAPI?.invoke) {
      try {
        const result = await electronAPI.invoke('check-ai-proxy-status');
        if (result.running) {
          setProxyStatus('running');
          return;
        }
      } catch (error) {
        console.error('检查 Electron 代理状态失败:', error);
      }
    }
    
    // 否则通过 HTTP 检查
    const isHealthy = await checkProxyHealth('http://localhost:3001/api/hunyuan');
    setProxyStatus(isHealthy ? 'running' : 'stopped');
  };
  
  // 一键启动代理服务器
  const handleStartProxy = async () => {
    const electronAPI = window.electron || window.electronAPI;
    
    if (!electronAPI?.invoke) {
      alert('❌ 此功能仅在 Electron 应用中可用\n\n请使用 npm run e 启动 Electron 版本');
      return;
    }
    
    setIsStartingProxy(true);
    setProxyLogs([]); // 清空日志
    
    try {
      const result = await electronAPI.invoke('start-ai-proxy');
      
      if (result.success) {
        alert(`✅ ${result.message}\n\nPID: ${result.pid}`);
        setProxyStatus('running');
      } else {
        alert(`❌ 启动失败\n\n${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      alert(`❌ 启动失败\n\n${error.message}`);
      console.error('启动代理失败:', error);
    } finally {
      setIsStartingProxy(false);
      // 1秒后重新检查状态
      setTimeout(checkProxyStatus, 1000);
    }
  };
  
  // 加载配置时同步到表单
  useEffect(() => {
    const currentConfig = AIConfigManager.getConfig();
    setProvider(currentConfig.provider as any);
    setApiKey(currentConfig.dashscopeApiKey || '');
    setHunyuanSecretId(currentConfig.hunyuanSecretId || '');
    setHunyuanSecretKey(currentConfig.hunyuanSecretKey || '');
  }, [config]);

  // 保存配置
  const handleSaveConfig = () => {
    try {
      const updateConfig: any = { provider };
      
      if (provider === 'dashscope') {
        updateConfig.dashscopeApiKey = apiKey;
      } else if (provider === 'hunyuan') {
        updateConfig.hunyuanSecretId = hunyuanSecretId;
        updateConfig.hunyuanSecretKey = hunyuanSecretKey;
      }
      
      AIConfigManager.saveConfig(updateConfig);
      setConfig(AIConfigManager.getConfig());
      setShowConfig(false);
      alert('✅ 配置保存成功！请重新检测 AI 可用性。');
    } catch (err: any) {
      alert('❌ 配置保存失败: ' + err.message);
    }
  };
  
  // 保存为预设
  const handleSavePreset = () => {
    try {
      if (!presetName.trim()) {
        alert('❌ 请输入预设名称');
        return;
      }
      
      if (provider === 'ollama') {
        alert('❌ Ollama 本地模式无需保存预设');
        return;
      }
      
      const presetData: any = {
        name: presetName.trim(),
        provider
      };
      
      if (provider === 'dashscope') {
        if (!apiKey) {
          alert('❌ 请先输入 API Key');
          return;
        }
        presetData.dashscopeApiKey = apiKey;
        presetData.dashscopeModel = 'qwen-plus';
      } else if (provider === 'hunyuan') {
        if (!hunyuanSecretId || !hunyuanSecretKey) {
          alert('❌ 请先输入 SecretId 和 SecretKey');
          return;
        }
        presetData.hunyuanSecretId = hunyuanSecretId;
        presetData.hunyuanSecretKey = hunyuanSecretKey;
        presetData.hunyuanModel = 'hunyuan-lite';
      }
      
      AIConfigManager.savePreset(presetData);
      setPresets(AIConfigManager.getPresets());
      setShowPresetDialog(false);
      setPresetName('');
      alert('✅ 预设保存成功！');
    } catch (err: any) {
      alert('❌ 保存失败: ' + err.message);
    }
  };
  
  // 应用预设
  const handleApplyPreset = (preset: APIPreset) => {
    try {
      AIConfigManager.applyPreset(preset);
      const newConfig = AIConfigManager.getConfig();
      setConfig(newConfig);
      setProvider(newConfig.provider as any);
      
      if (preset.provider === 'dashscope') {
        setApiKey(preset.dashscopeApiKey || '');
      } else if (preset.provider === 'hunyuan') {
        setHunyuanSecretId(preset.hunyuanSecretId || '');
        setHunyuanSecretKey(preset.hunyuanSecretKey || '');
      }
      
      alert(`✅ 已应用预设: ${preset.name}`);
    } catch (err: any) {
      alert('❌ 应用失败: ' + err.message);
    }
  };
  
  // 删除预设
  const handleDeletePreset = (id: string, name: string) => {
    if (confirm(`确定删除预设 "${name}" 吗？`)) {
      try {
        AIConfigManager.deletePreset(id);
        setPresets(AIConfigManager.getPresets());
        alert('✅ 预设已删除');
      } catch (err: any) {
        alert('❌ 删除失败: ' + err.message);
      }
    }
  };

  // 检测 AI 可用性
  const checkAIAvailability = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const aiService = new AIService();
      const test = await aiService.testAvailability();
      
      if (test.available) {
        setAIStatus(`✅ ${test.model} 可用`);
        setError(null);
      } else {
        setAIStatus('❌ 不可用');
        setError(test.error || '未知错误');
      }
    } catch (err: any) {
      setAIStatus('❌ 检测失败');
      setError(err.message || '未知错误');
    } finally {
      setLoading(false);
    }
  };

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setExtractedInfo(null);
      setError(null);
    }
  };

  // 处理文件拖拽
  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      setExtractedInfo(null);
      setError(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  // 提取事件信息
  const handleExtract = async () => {
    if (!file) {
      setError('请先选择文件');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const aiService = new AIService();
      const result = await aiService.extractEventFromDocument(file);
      
      setExtractedInfo(result);
      
      // 填充编辑字段
      setEditedTitle(result.title);
      setEditedStartTime(result.startTime.slice(0, 16)); // ISO -> datetime-local
      setEditedEndTime(result.endTime.slice(0, 16));
      setEditedLocation(result.location || '');
      setEditedAgenda(result.agenda || '');
      
    } catch (err: any) {
      setError(err.message || '提取失败');
      console.error('[AIDemo] 提取失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 创建事件
  const handleCreateEvent = async () => {
    if (!extractedInfo) return;

    try {
      // 动态导入 EventHub
      const { EventHub } = await import('../services/EventHub');

      // 构建 Event 对象（仿照 EventEditModal）
      const newEvent: Event = {
        id: `ai-${Date.now()}`,
        title: { simpleTitle: editedTitle },
        startTime: editedStartTime + ':00', // datetime-local -> 本地时间（无时区）
        endTime: editedEndTime + ':00',
        location: editedLocation,
        description: editedAgenda,
        isAllDay: false,
        createdAt: formatTimeForStorage(new Date()),
        updatedAt: formatTimeForStorage(new Date()),
        tags: [], // 暂时为空，避免使用不存在的标签
        fourDNoteSource: true,
        syncStatus: 'pending',
        attendees: extractedInfo.attendees
      };

      console.log('[AIDemo] 📋 准备创建事件:', newEvent);

      // 使用 EventHub 创建事件（与 EventEditModal 保持一致）
      const result = await EventHub.createEvent(newEvent);
      
      console.log('[AIDemo] 🔄 创建结果:', result);
      
      if (result.success) {
        // 获取创建后的事件快照
        const createdEvent = await EventHub.getSnapshotAsync(newEvent.id);
        console.log('[AIDemo] ✅ 事件已创建，快照:', createdEvent);
        
        alert('✅ 事件创建成功！\n\n可以在 TimeCalendar 中查看该事件。');
        
        // 重置状态
        setFile(null);
        setExtractedInfo(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } else {
        alert('❌ 创建失败: ' + result.error);
      }
    } catch (err: any) {
      alert('❌ 创建失败: ' + err.message);
      console.error('[AIDemo] 创建失败:', err);
    }
  };

  return (
    <div className="ai-demo-page">
      <div className="ai-demo-container">
        {/* 头部 */}
        <div className="ai-demo-header">
          <h1>🤖 AI 事件提取 Demo</h1>
          <p className="subtitle">测试 AI 从文档中自动提取事件信息的功能</p>
          <button 
            className="btn-config"
            onClick={() => setShowConfig(!showConfig)}
          >
            ⚙️ {showConfig ? '关闭配置' : '配置 API'}
          </button>
        </div>

        {/* API 配置面板 */}
        {showConfig && (
          <div className="config-panel">
            <h3>🔧 API 配置</h3>
            
            <div className="config-group">
              <label>选择服务商：</label>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    value="dashscope"
                    checked={provider === 'dashscope'}
                    onChange={(e) => setProvider(e.target.value as any)}
                  />
                  <span>DashScope 云端</span>
                  <span className="badge">免费额度 100万 tokens</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="hunyuan"
                    checked={provider === 'hunyuan'}
                    onChange={(e) => setProvider(e.target.value as any)}
                  />
                  <span>腾讯混元云端（需代理）</span>
                  <span className="badge">10万 tokens/月</span>
                  {provider === 'hunyuan' && (
                    <span className={`proxy-status ${proxyStatus}`}>
                      {proxyStatus === 'checking' && '🔄 检查中...'}
                      {proxyStatus === 'running' && '✅ 代理运行中'}
                      {proxyStatus === 'stopped' && '❌ 代理未启动'}
                    </span>
                  )}
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    value="ollama"
                    checked={provider === 'ollama'}
                    onChange={(e) => setProvider(e.target.value as any)}
                  />
                  <span>Ollama 本地</span>
                  <span className="badge-warning">需下载 4.7GB 模型</span>
                </label>
              </div>
            </div>

            {provider === 'dashscope' && (
              <div className="config-group">
                <label>DashScope API Key：</label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-xxxxxxxxxxxxxxxx"
                  className="api-key-input"
                />
                <div className="help-text">
                  <p>💡 获取 API Key：</p>
                  <a 
                    href="https://dashscope.console.aliyun.com/apiKey" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    https://dashscope.console.aliyun.com/apiKey
                  </a>
                  <p className="hint">新用户免费赠送 100 万 tokens（约 1000-2000 次调用）</p>
                </div>
              </div>
            )}

            {provider === 'hunyuan' && (
              <div className="config-group">
                {/* 代理状态提示 */}
                {proxyStatus === 'stopped' && (
                  <div className="help-text" style={{ 
                    marginBottom: '16px', 
                    background: '#fef2f2', 
                    borderLeft: '4px solid #ef4444',
                    padding: '16px'
                  }}>
                    <p style={{ fontWeight: 'bold', color: '#dc2626', marginBottom: '8px' }}>
                      ⚠️ 代理服务器未启动
                    </p>
                    
                    {/* Electron 环境显示一键启动按钮 */}
                    {(window.electron?.invoke || window.electronAPI?.invoke) ? (
                      <>
                        <p>点击下方按钮一键启动代理服务器：</p>
                        <button 
                          className="btn-start-proxy"
                          onClick={handleStartProxy}
                          disabled={isStartingProxy}
                          style={{ 
                            marginTop: '12px',
                            padding: '12px 24px',
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            cursor: isStartingProxy ? 'not-allowed' : 'pointer',
                            opacity: isStartingProxy ? 0.6 : 1,
                            transition: 'all 0.3s ease'
                          }}
                        >
                          {isStartingProxy ? '🔄 启动中...' : '🚀 一键启动代理服务器'}
                        </button>
                        <p style={{ fontSize: '12px', marginTop: '8px', color: '#6b7280' }}>
                          启动后会自动在后台运行，无需手动操作
                        </p>
                      </>
                    ) : (
                      <>
                        <p>请在新终端中运行以下命令：</p>
                        <div style={{ 
                          background: '#1e293b', 
                          color: '#e2e8f0', 
                          padding: '12px', 
                          borderRadius: '6px',
                          fontFamily: 'monospace',
                          marginTop: '8px',
                          marginBottom: '8px'
                        }}>
                          <div>cd ai-proxy</div>
                          <div>npm install</div>
                          <div>npm start</div>
                        </div>
                      </>
                    )}
                    
                    <button 
                      className="btn-primary"
                      onClick={checkProxyStatus}
                      style={{ marginTop: '8px' }}
                    >
                      🔄 重新检测代理状态
                    </button>
                    
                    {/* 显示代理日志（如果有） */}
                    {proxyLogs.length > 0 && (
                      <div style={{
                        marginTop: '12px',
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: '#1e293b',
                        color: '#e2e8f0',
                        padding: '12px',
                        borderRadius: '6px',
                        fontFamily: 'monospace',
                        fontSize: '12px'
                      }}>
                        {proxyLogs.map((log, idx) => (
                          <div key={idx} style={{ 
                            color: log.type === 'error' ? '#fca5a5' : '#e2e8f0',
                            marginBottom: '4px'
                          }}>
                            {log.message}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {proxyStatus === 'running' && (
                  <div className="help-text" style={{ 
                    marginBottom: '16px', 
                    background: '#f0fdf4', 
                    borderLeft: '4px solid #22c55e',
                    padding: '12px'
                  }}>
                    <p style={{ color: '#16a34a' }}>
                      ✅ 代理服务器运行正常
                    </p>
                  </div>
                )}
                
                <div className="help-text" style={{ marginBottom: '16px', background: '#eff6ff', borderLeft: '4px solid #3b82f6' }}>
                  <p>💡 <strong>关于代理服务器</strong></p>
                  <p>由于浏览器 CORS 限制，需要本地代理转发请求</p>
                  <p style={{ marginTop: '8px' }}>
                    详细说明: <code>ai-proxy/README.md</code>
                  </p>
                </div>
                
                <label>腾讯云 SecretId：</label>
                <input
                  type="text"
                  value={hunyuanSecretId}
                  onChange={(e) => setHunyuanSecretId(e.target.value)}
                  placeholder="AKIDxxxxxxxxxxxxxxxx"
                  className="api-key-input"
                />
                <label>腾讯云 SecretKey：</label>
                <input
                  type="password"
                  value={hunyuanSecretKey}
                  onChange={(e) => setHunyuanSecretKey(e.target.value)}
                  placeholder="xxxxxxxxxxxxxxxx"
                  className="api-key-input"
                />
                <div className="help-text">
                  <p>� 此功能需要后端代理服务器支持。</p>
                  <p>如需使用，请参考：<a 
                    href="https://cloud.tencent.com/document/api/1729/106050" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    腾讯云 API 文档
                  </a></p>
                </div>
              </div>
            )}

            {provider === 'ollama' && (
              <div className="config-group">
                <div className="help-text warning">
                  <p>⚠️ 使用 Ollama 本地模型需要：</p>
                  <ul>
                    <li>下载 Qwen 2.5 模型（约 4.7GB）</li>
                    <li>占用 4-6GB 内存运行</li>
                    <li>首次加载需要 2-5 秒</li>
                  </ul>
                  <p>💡 推荐使用云端服务（零安装、更快、中文优化）</p>
                </div>
              </div>
            )}

            <div className="config-actions">
              <button className="btn-save" onClick={handleSaveConfig}>
                💾 保存配置
              </button>
              {provider !== 'ollama' && (
                <button className="btn-save-preset" onClick={() => setShowPresetDialog(true)}>
                  ⭐ 保存为预设
                </button>
              )}
              <button className="btn-cancel-config" onClick={() => setShowConfig(false)}>
                取消
              </button>
            </div>
            
            {/* 预设列表 */}
            {presets.length > 0 && (
              <div className="presets-section">
                <h4>📋 已保存的预设</h4>
                <div className="presets-list">
                  {presets.map(preset => (
                    <div key={preset.id} className="preset-item">
                      <div className="preset-info">
                        <span className="preset-name">{preset.name}</span>
                        <span className="preset-provider">
                          {preset.provider === 'dashscope' ? 'DashScope' : '腾讯混元'}
                        </span>
                      </div>
                      <div className="preset-actions">
                        <button 
                          className="btn-apply-preset"
                          onClick={() => handleApplyPreset(preset)}
                        >
                          应用
                        </button>
                        <button 
                          className="btn-delete-preset"
                          onClick={() => handleDeletePreset(preset.id, preset.name)}
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 保存预设对话框 */}
        {showPresetDialog && (
          <div className="preset-dialog-overlay" onClick={() => setShowPresetDialog(false)}>
            <div className="preset-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>💾 保存为预设</h3>
              <p className="dialog-hint">
                保存当前 API 配置，方便下次快速切换
              </p>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="输入预设名称（例如：工作账号、个人账号）"
                className="preset-name-input"
                autoFocus
              />
              <div className="dialog-actions">
                <button className="btn-save" onClick={handleSavePreset}>
                  保存
                </button>
                <button className="btn-cancel-config" onClick={() => {
                  setShowPresetDialog(false);
                  setPresetName('');
                }}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* 保存预设对话框 */}
        {showPresetDialog && (
          <div className="preset-dialog-overlay" onClick={() => setShowPresetDialog(false)}>
            <div className="preset-dialog" onClick={(e) => e.stopPropagation()}>
              <h3>💾 保存为预设</h3>
              <p className="dialog-hint">
                保存当前 API 配置，方便下次快速切换
              </p>
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="输入预设名称（例如：工作账号、个人账号）"
                className="preset-name-input"
                autoFocus
              />
              <div className="dialog-actions">
                <button className="btn-save" onClick={handleSavePreset}>
                  保存
                </button>
                <button className="btn-cancel-config" onClick={() => {
                  setShowPresetDialog(false);
                  setPresetName('');
                }}>
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* AI 状态检测 */}
        <div className="ai-status-section">
          <h2>1️⃣ AI 服务状态</h2>
          <div className="status-card">
            <div className="status-row">
              <span className="label">服务商：</span>
              <span className="value">
                {config.provider === 'dashscope' ? '☁️ DashScope 云端' : 
                 config.provider === 'hunyuan' ? '☁️ 腾讯混元云端' : '💻 Ollama 本地'}
              </span>
            </div>
            
            {config.provider === 'dashscope' && (
              <>
                <div className="status-row">
                  <span className="label">模型版本：</span>
                  <span className="value">{config.dashscopeModel || 'qwen-plus'}</span>
                </div>
                <div className="status-row">
                  <span className="label">API Key：</span>
                  <span className="value">
                    {config.dashscopeApiKey 
                      ? '••••••••' + config.dashscopeApiKey.slice(-4) 
                      : '未配置'}
                  </span>
                </div>
              </>
            )}
            
            {config.provider === 'hunyuan' && (
              <>
                <div className="status-row">
                  <span className="label">模型版本：</span>
                  <span className="value">{config.hunyuanModel || 'hunyuan-lite'}</span>
                </div>
                <div className="status-row">
                  <span className="label">SecretId：</span>
                  <span className="value">
                    {config.hunyuanSecretId 
                      ? config.hunyuanSecretId.slice(0, 8) + '••••••••' 
                      : '未配置'}
                  </span>
                </div>
                <div className="status-row">
                  <span className="label">SecretKey：</span>
                  <span className="value">
                    {config.hunyuanSecretKey 
                      ? '••••••••' + config.hunyuanSecretKey.slice(-4) 
                      : '未配置'}
                  </span>
                </div>
              </>
            )}
            
            {config.provider === 'ollama' && (
              <>
                <div className="status-row">
                  <span className="label">当前模型：</span>
                  <span className="value">{config.currentModel === 'qwen' ? 'Qwen 2.5' : 'Gemma 2'}</span>
                </div>
                <div className="status-row">
                  <span className="label">模型版本：</span>
                  <span className="value">{AIConfigManager.getCurrentModelName()}</span>
                </div>
                <div className="status-row">
                  <span className="label">服务地址：</span>
                  <span className="value">{config.ollamaBaseUrl}</span>
                </div>
              </>
            )}
            
            <div className="status-row">
              <span className="label">状态：</span>
              <span className="value">{aiStatus}</span>
            </div>
            
            <button 
              className="btn-check"
              onClick={checkAIAvailability}
              disabled={loading}
            >
              {loading ? '检测中...' : '🔍 检测 AI 可用性'}
            </button>
            
            {error && aiStatus === '❌ 不可用' && (
              <div className="error-box">
                <p><strong>错误信息：</strong></p>
                <pre>{error}</pre>
                <div className="help-links">
                  <p>💡 解决方案：</p>
                  {config.provider === 'dashscope' ? (
                    <ol>
                      <li>确认 API Key 正确</li>
                      <li>检查网络连接</li>
                      <li>
                        获取 API Key: 
                        <a href="https://dashscope.console.aliyun.com/apiKey" target="_blank" rel="noopener noreferrer">
                          点击获取
                        </a>
                      </li>
                    </ol>
                  ) : config.provider === 'hunyuan' ? (
                    <ol>
                      <li>确认 SecretId 和 SecretKey 正确</li>
                      <li>检查网络连接</li>
                      <li>
                        获取密钥: 
                        <a href="https://console.cloud.tencent.com/cam/capi" target="_blank" rel="noopener noreferrer">
                          点击获取
                        </a>
                      </li>
                    </ol>
                  ) : (
                    <ol>
                      <li>安装 Ollama: <a href="https://ollama.ai/download" target="_blank" rel="noopener noreferrer">点击下载</a></li>
                      <li>启动服务: <code>ollama serve</code></li>
                      <li>下载模型: <code>ollama pull {config.currentModel === 'qwen' ? 'qwen2.5:7b' : 'gemma2:9b'}</code></li>
                    </ol>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 文件上传 */}
        <div className="file-upload-section">
          <h2>2️⃣ 上传文档</h2>
          <div 
            className="drop-zone"
            onDrop={handleFileDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="file-info">
                <div className="file-icon">📄</div>
                <div className="file-name">{file.name}</div>
                <div className="file-size">{(file.size / 1024).toFixed(2)} KB</div>
              </div>
            ) : (
              <div className="drop-zone-placeholder">
                <div className="upload-icon">📤</div>
                <p>拖拽文件到这里，或点击选择</p>
                <p className="file-types">支持 PDF 和文本文件</p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
          
          <button
            className="btn-extract"
            onClick={handleExtract}
            disabled={!file || loading}
          >
            {loading ? '⏳ AI 分析中...' : '🚀 开始提取'}
          </button>
        </div>

        {/* 错误提示 */}
        {error && aiStatus !== '❌ 不可用' && (
          <div className="error-banner">
            ❌ {error}
          </div>
        )}

        {/* 提取结果 */}
        {extractedInfo && (
          <div className="extraction-result">
            <h2>3️⃣ 提取结果（可编辑）</h2>
            
            <div className="confidence-badge">
              置信度: {(extractedInfo.confidence * 100).toFixed(0)}%
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>会议名称 *</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  placeholder="请输入会议名称"
                />
              </div>

              <div className="form-field">
                <label>开始时间 *</label>
                <input
                  type="datetime-local"
                  value={editedStartTime}
                  onChange={(e) => setEditedStartTime(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label>结束时间 *</label>
                <input
                  type="datetime-local"
                  value={editedEndTime}
                  onChange={(e) => setEditedEndTime(e.target.value)}
                />
              </div>

              <div className="form-field">
                <label>地点</label>
                <input
                  type="text"
                  value={editedLocation}
                  onChange={(e) => setEditedLocation(e.target.value)}
                  placeholder="会议地点"
                />
              </div>

              {extractedInfo.attendees && extractedInfo.attendees.length > 0 && (
                <div className="form-field full-width">
                  <label>参与方</label>
                  <div className="attendees-list">
                    {extractedInfo.attendees.map((att, idx) => (
                      <span key={idx} className="attendee-tag">
                        {att.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-field full-width">
                <label>议程</label>
                <textarea
                  rows={6}
                  value={editedAgenda}
                  onChange={(e) => setEditedAgenda(e.target.value)}
                  placeholder="详细议程安排"
                />
              </div>
            </div>

            <div className="action-buttons">
              <button
                className="btn-create"
                onClick={handleCreateEvent}
                disabled={!editedTitle || !editedStartTime || !editedEndTime}
              >
                ✅ 确认创建事件
              </button>
              
              <button
                className="btn-cancel"
                onClick={() => {
                  setExtractedInfo(null);
                  setFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* 使用说明 */}
        <div className="usage-guide">
          <h3>📖 使用指南</h3>
          <ol>
            <li>确保 Ollama 服务已启动（<code>ollama serve</code>）</li>
            <li>确保已下载模型（<code>ollama pull qwen2.5:7b</code>）</li>
            <li>点击"检测 AI 可用性"验证服务状态</li>
            <li>上传会议邀请函 PDF 或文本文件</li>
            <li>点击"开始提取"，AI 将自动分析</li>
            <li>预览并编辑提取结果</li>
            <li>点击"确认创建事件"保存到日历</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default AIDemo;
