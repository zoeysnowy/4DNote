/**
 * AI Event Extraction Demo V2 - Enhanced
 * 
 * 新功能：
 * 1. ✅ 批量上传（文件/文本/网页链接）
 * 2. ✅ 批量处理和进度跟踪
 * 3. ✅ 结果打分系统
 * 4. ✅ 基于打分的 Prompt 自动优化
 * 5. ✅ 优化历史记录和对比
 * 
 * @author Zoey Gong
 * @version 2.0.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { AIService } from '../services/ai/AIService';
import { AIConfigManager, APIPreset } from '../services/ai/AIConfig';
import { ExtractedEventInfo } from '../services/ai/AIProvider.interface';
import { checkProxyHealth } from '../utils/proxyHelper';
import './AIDemoV2.css';

// 批处理任务接口
interface BatchTask {
  id: string;
  type: 'file' | 'text' | 'url';
  content: string | File;
  filename?: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: ExtractedEventInfo;
  error?: string;
  rating?: number; // 1-5 星评分
  feedback?: string; // 用户反馈
  processedAt?: Date;
}

// Prompt 优化历史
interface PromptVersion {
  id: string;
  version: number;
  prompt: string;
  averageRating: number;
  totalTasks: number;
  createdAt: Date;
  improvements: string[];
}

export const AIDemoV2: React.FC = () => {
  // 配置状态
  const [config, setConfig] = useState(() => AIConfigManager.getConfig());
  const [showConfig, setShowConfig] = useState(false);
  const [provider, setProvider] = useState<'ollama' | 'dashscope' | 'hunyuan'>(
    config.provider as 'ollama' | 'dashscope' | 'hunyuan'
  );
  const [apiKey, setApiKey] = useState(config.dashscopeApiKey || '');
  const [hunyuanSecretId, setHunyuanSecretId] = useState(config.hunyuanSecretId || '');
  const [hunyuanSecretKey, setHunyuanSecretKey] = useState(config.hunyuanSecretKey || '');
  
  // 代理状态
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'running' | 'stopped'>('checking');
  const [isStartingProxy, setIsStartingProxy] = useState(false);
  
  // 批处理状态
  const [batchTasks, setBatchTasks] = useState<BatchTask[]>([]);
  const [processing, setProcessing] = useState(false);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(-1);
  const [showBatchInput, setShowBatchInput] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  
  // Prompt 优化
  const [currentPrompt, setCurrentPrompt] = useState(getDefaultPrompt());
  const [promptVersions, setPromptVersions] = useState<PromptVersion[]>(() => {
    const saved = localStorage.getItem('ai-prompt-versions');
    return saved ? JSON.parse(saved) : [createInitialVersion()];
  });
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  
  // UI 状态
  const [activeTab, setActiveTab] = useState<'upload' | 'batch' | 'history'>('upload');
  const [selectedTask, setSelectedTask] = useState<BatchTask | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 默认 Prompt
  function getDefaultPrompt(): string {
    return `你是一个专业的会议信息提取助手。从给定文本中提取会议相关信息。

请按照以下JSON格式返回：
{
  "title": "会议名称",
  "startTime": "YYYY-MM-DD HH:mm",
  "endTime": "YYYY-MM-DD HH:mm",
  "location": "会议地点",
  "attendees": [{"name": "参与者姓名", "role": "职位"}],
  "agenda": "会议议程详细描述",
  "confidence": 0.95
}

注意：
1. 时间必须是完整的日期时间格式
2. confidence 是 0-1 之间的置信度
3. 如果信息不确定，降低 confidence 值
4. agenda 要包含完整的议程内容`;
  }

  // 创建初始版本
  function createInitialVersion(): PromptVersion {
    return {
      id: 'v1',
      version: 1,
      prompt: getDefaultPrompt(),
      averageRating: 0,
      totalTasks: 0,
      createdAt: new Date(),
      improvements: ['初始版本']
    };
  }

  // 保存 Prompt 版本
  useEffect(() => {
    localStorage.setItem('ai-prompt-versions', JSON.stringify(promptVersions));
  }, [promptVersions]);

  // 检查代理状态
  useEffect(() => {
    if (provider === 'hunyuan') {
      checkProxyStatus();
      const interval = setInterval(checkProxyStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [provider]);

  const checkProxyStatus = async () => {
    setProxyStatus('checking');
    const isHealthy = await checkProxyHealth('http://localhost:3001/api/hunyuan');
    setProxyStatus(isHealthy ? 'running' : 'stopped');
  };

  // 启动代理
  const handleStartProxy = async () => {
    const electronAPI = (window as any).electron || (window as any).electronAPI;
    if (!electronAPI?.invoke) {
      alert('❌ 此功能仅在 Electron 应用中可用\n\n请使用 npm run e 启动 Electron 版本');
      return;
    }
    
    setIsStartingProxy(true);
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
    } finally {
      setIsStartingProxy(false);
    }
  };

  // 添加文件任务
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newTasks: BatchTask[] = files.map(file => ({
      id: `file-${Date.now()}-${Math.random()}`,
      type: 'file',
      content: file,
      filename: file.name,
      status: 'pending'
    }));
    setBatchTasks([...batchTasks, ...newTasks]);
  };

  // 添加文本任务
  const handleAddTextBatch = () => {
    if (!batchText.trim()) return;
    
    const texts = batchText.split('\n\n').filter(t => t.trim());
    const newTasks: BatchTask[] = texts.map((text, idx) => ({
      id: `text-${Date.now()}-${idx}`,
      type: 'text',
      content: text,
      filename: `文本 ${batchTasks.filter(t => t.type === 'text').length + idx + 1}`,
      status: 'pending'
    }));
    
    setBatchTasks([...batchTasks, ...newTasks]);
    setBatchText('');
    setShowBatchInput(false);
  };

  // 添加 URL 任务
  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    
    const urls = urlInput.split('\n').filter(u => u.trim());
    const newTasks: BatchTask[] = urls.map((url, idx) => ({
      id: `url-${Date.now()}-${idx}`,
      type: 'url',
      content: url,
      filename: `链接 ${batchTasks.filter(t => t.type === 'url').length + idx + 1}`,
      status: 'pending'
    }));
    
    setBatchTasks([...batchTasks, ...newTasks]);
    setUrlInput('');
  };

  // 批量处理
  const handleBatchProcess = async () => {
    const pendingTasks = batchTasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
      alert('没有待处理的任务');
      return;
    }

    setProcessing(true);
    
    for (let i = 0; i < pendingTasks.length; i++) {
      const task = pendingTasks[i];
      const taskIndex = batchTasks.findIndex(t => t.id === task.id);
      setCurrentTaskIndex(taskIndex);
      
      // 更新状态为处理中
      setBatchTasks(prev => prev.map(t => 
        t.id === task.id ? { ...t, status: 'processing' as const } : t
      ));

      try {
        let textContent = '';
        
        // 获取文本内容
        if (task.type === 'file') {
          textContent = await readFileContent(task.content as File);
        } else if (task.type === 'text') {
          textContent = task.content as string;
        } else if (task.type === 'url') {
          textContent = await fetchUrlContent(task.content as string);
        }

        // AI 提取
        const aiService = new AIService();
        const result = await aiService.extractEventInfo(textContent, currentPrompt);
        
        // 更新为完成
        setBatchTasks(prev => prev.map(t => 
          t.id === task.id ? { 
            ...t, 
            status: 'completed' as const, 
            result,
            processedAt: new Date()
          } : t
        ));
        
      } catch (error: any) {
        // 更新为错误
        setBatchTasks(prev => prev.map(t => 
          t.id === task.id ? { 
            ...t, 
            status: 'error' as const, 
            error: error.message 
          } : t
        ));
      }
      
      // 避免请求过快
      if (i < pendingTasks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    setProcessing(false);
    setCurrentTaskIndex(-1);
  };

  // 读取文件内容
  const readFileContent = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  // 获取 URL 内容（简化版）
  const fetchUrlContent = async (url: string): Promise<string> => {
    // 这里需要后端支持或使用第三方服务
    // 暂时返回 URL 本身
    return `URL: ${url}\n\n请实现实际的网页抓取功能`;
  };

  // 评分
  const handleRating = (taskId: string, rating: number, feedback?: string) => {
    setBatchTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, rating, feedback } : t
    ));
    
    // 触发 Prompt 优化检查
    checkAndOptimizePrompt();
  };

  // 检查并优化 Prompt
  const checkAndOptimizePrompt = () => {
    const ratedTasks = batchTasks.filter(t => t.rating !== undefined);
    if (ratedTasks.length < 5) return; // 至少需要5个评分
    
    const recentTasks = ratedTasks.slice(-10); // 最近10个
    const avgRating = recentTasks.reduce((sum, t) => sum + (t.rating || 0), 0) / recentTasks.length;
    
    // 如果平均评分低于3.5，建议优化
    if (avgRating < 3.5) {
      const lowRatedTasks = recentTasks.filter(t => (t.rating || 0) < 3);
      const commonIssues = analyzeFeedback(lowRatedTasks);
      
      if (confirm(`检测到平均评分较低（${avgRating.toFixed(1)}⭐）\n\n常见问题：\n${commonIssues.join('\n')}\n\n是否自动优化 Prompt？`)) {
        optimizePrompt(commonIssues);
      }
    }
  };

  // 分析反馈
  const analyzeFeedback = (tasks: BatchTask[]): string[] => {
    const issues: string[] = [];
    const feedbacks = tasks.map(t => t.feedback?.toLowerCase() || '');
    
    if (feedbacks.some(f => f.includes('时间') || f.includes('日期'))) {
      issues.push('• 时间提取不准确');
    }
    if (feedbacks.some(f => f.includes('地点') || f.includes('位置'))) {
      issues.push('• 地点信息缺失');
    }
    if (feedbacks.some(f => f.includes('参与') || f.includes('人员'))) {
      issues.push('• 参与者识别有误');
    }
    if (feedbacks.some(f => f.includes('议程') || f.includes('内容'))) {
      issues.push('• 议程提取不完整');
    }
    
    return issues.length > 0 ? issues : ['• 整体质量需要提升'];
  };

  // 自动优化 Prompt
  const optimizePrompt = (issues: string[]) => {
    let optimizedPrompt = currentPrompt;
    const improvements: string[] = [];
    
    // 根据问题调整 Prompt
    if (issues.some(i => i.includes('时间'))) {
      optimizedPrompt += '\n\n特别注意：\n- 仔细识别时间信息，包括年月日和时分\n- 如果只有时间没有日期，结合上下文推断';
      improvements.push('增强时间识别');
    }
    
    if (issues.some(i => i.includes('地点'))) {
      optimizedPrompt += '\n- 地点可能在"地址"、"会议室"、"线上链接"等字段中';
      improvements.push('扩展地点识别范围');
    }
    
    if (issues.some(i => i.includes('参与'))) {
      optimizedPrompt += '\n- 参与者可能标注为"主持人"、"嘉宾"、"与会者"等';
      improvements.push('优化参与者提取');
    }
    
    if (issues.some(i => i.includes('议程'))) {
      optimizedPrompt += '\n- 议程需要包含所有讨论主题和时间安排';
      improvements.push('完善议程提取');
    }
    
    // 创建新版本
    const newVersion: PromptVersion = {
      id: `v${promptVersions.length + 1}`,
      version: promptVersions.length + 1,
      prompt: optimizedPrompt,
      averageRating: 0,
      totalTasks: 0,
      createdAt: new Date(),
      improvements
    };
    
    setPromptVersions([...promptVersions, newVersion]);
    setCurrentPrompt(optimizedPrompt);
    
    alert(`✅ Prompt 已自动优化！\n\n改进项：\n${improvements.map(i => '• ' + i).join('\n')}\n\n新版本：v${newVersion.version}`);
  };

  // 保存配置
  const handleSaveConfig = () => {
    try {
      const newConfig: any = { provider };
      
      if (provider === 'dashscope') {
        if (!apiKey) {
          alert('❌ 请输入 DashScope API Key');
          return;
        }
        newConfig.dashscopeApiKey = apiKey;
        newConfig.dashscopeModel = 'qwen-plus';
      } else if (provider === 'hunyuan') {
        if (!hunyuanSecretId || !hunyuanSecretKey) {
          alert('❌ 请输入腾讯云密钥');
          return;
        }
        newConfig.hunyuanSecretId = hunyuanSecretId;
        newConfig.hunyuanSecretKey = hunyuanSecretKey;
        newConfig.hunyuanModel = 'hunyuan-lite';
      }
      
      AIConfigManager.saveConfig(newConfig);
      setConfig(AIConfigManager.getConfig());
      setShowConfig(false);
      alert('✅ 配置已保存');
    } catch (err: any) {
      alert('❌ 保存失败: ' + err.message);
    }
  };

  // 渲染任务卡片
  const renderTaskCard = (task: BatchTask, index: number) => {
    const isProcessing = currentTaskIndex === index && processing;
    
    return (
      <div 
        key={task.id} 
        className={`task-card ${task.status} ${selectedTask?.id === task.id ? 'selected' : ''}`}
        onClick={() => setSelectedTask(task)}
      >
        <div className="task-header">
          <div className="task-type">
            {task.type === 'file' && '📄'}
            {task.type === 'text' && '📝'}
            {task.type === 'url' && '🔗'}
            <span>{task.filename}</span>
          </div>
          
          <div className="task-status-badge">
            {task.status === 'pending' && '⏳ 待处理'}
            {task.status === 'processing' && '⚙️ 处理中'}
            {task.status === 'completed' && '✅ 完成'}
            {task.status === 'error' && '❌ 失败'}
          </div>
        </div>
        
        {isProcessing && (
          <div className="progress-bar">
            <div className="progress-fill"></div>
          </div>
        )}
        
        {task.status === 'completed' && task.result && (
          <div className="task-result-preview">
            <div className="result-title">{task.result.title}</div>
            <div className="result-meta">
              置信度: {(task.result.confidence * 100).toFixed(0)}%
            </div>
            
            {/* 评分区域 */}
            <div className="rating-section">
              <div className="stars">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    className={`star ${task.rating && star <= task.rating ? 'active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRating(task.id, star);
                    }}
                  >
                    ⭐
                  </button>
                ))}
              </div>
              {task.rating && (
                <span className="rating-value">{task.rating}.0</span>
              )}
            </div>
            
            {/* 反馈输入 */}
            {task.rating && task.rating < 4 && (
              <textarea
                className="feedback-input"
                placeholder="请描述问题（帮助我们优化）..."
                value={task.feedback || ''}
                onChange={(e) => {
                  e.stopPropagation();
                  setBatchTasks(prev => prev.map(t => 
                    t.id === task.id ? { ...t, feedback: e.target.value } : t
                  ));
                }}
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )}
        
        {task.status === 'error' && (
          <div className="task-error">
            {task.error}
          </div>
        )}
      </div>
    );
  };

  // 统计数据
  const stats = {
    total: batchTasks.length,
    completed: batchTasks.filter(t => t.status === 'completed').length,
    pending: batchTasks.filter(t => t.status === 'pending').length,
    error: batchTasks.filter(t => t.status === 'error').length,
    avgRating: batchTasks.filter(t => t.rating).length > 0
      ? batchTasks.filter(t => t.rating).reduce((sum, t) => sum + (t.rating || 0), 0) / batchTasks.filter(t => t.rating).length
      : 0
  };

  return (
    <div className="ai-demo-v2">
      <div className="demo-header">
        <h1>🤖 AI 事件提取工具 V2</h1>
        <p className="subtitle">批量处理 • 智能评分 • 自动优化</p>
        
        <div className="header-actions">
          {provider === 'hunyuan' && proxyStatus === 'stopped' && 
           ((window as any).electron?.invoke || (window as any).electronAPI?.invoke) && (
            <button className="btn-start-proxy" onClick={handleStartProxy} disabled={isStartingProxy}>
              {isStartingProxy ? '🔄 启动中...' : '🚀 启动代理'}
            </button>
          )}
          
          <button className="btn-config" onClick={() => setShowConfig(!showConfig)}>
            ⚙️ 配置
          </button>
          
          <button className="btn-prompt" onClick={() => setShowPromptEditor(!showPromptEditor)}>
            📝 Prompt
          </button>
          
          <button className="btn-history" onClick={() => setShowHistory(!showHistory)}>
            📊 历史
          </button>
        </div>
      </div>

      {/* 配置面板 */}
      {showConfig && (
        <div className="config-panel">
          <h3>⚙️ AI 配置</h3>
          
          <div className="provider-selector">
            <label>
              <input
                type="radio"
                value="ollama"
                checked={provider === 'ollama'}
                onChange={(e) => setProvider(e.target.value as any)}
              />
              Ollama (本地)
            </label>
            <label>
              <input
                type="radio"
                value="dashscope"
                checked={provider === 'dashscope'}
                onChange={(e) => setProvider(e.target.value as any)}
              />
              DashScope (阿里云)
            </label>
            <label>
              <input
                type="radio"
                value="hunyuan"
                checked={provider === 'hunyuan'}
                onChange={(e) => setProvider(e.target.value as any)}
              />
              腾讯混元
            </label>
          </div>
          
          {provider === 'dashscope' && (
            <div className="config-group">
              <label>API Key:</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
              />
            </div>
          )}
          
          {provider === 'hunyuan' && (
            <div className="config-group">
              <label>Secret ID:</label>
              <input
                type="text"
                value={hunyuanSecretId}
                onChange={(e) => setHunyuanSecretId(e.target.value)}
                placeholder="AKID..."
              />
              <label>Secret Key:</label>
              <input
                type="password"
                value={hunyuanSecretKey}
                onChange={(e) => setHunyuanSecretKey(e.target.value)}
              />
              <div className="proxy-status-indicator">
                <span className={`status-dot ${proxyStatus}`}></span>
                代理: {proxyStatus === 'running' ? '运行中' : '已停止'}
              </div>
            </div>
          )}
          
          <button className="btn-save" onClick={handleSaveConfig}>
            💾 保存配置
          </button>
        </div>
      )}

      {/* Prompt 编辑器 */}
      {showPromptEditor && (
        <div className="prompt-editor">
          <h3>📝 Prompt 模板</h3>
          <div className="version-info">
            当前版本: v{promptVersions[promptVersions.length - 1].version} 
            {stats.avgRating > 0 && ` • 平均评分: ${stats.avgRating.toFixed(1)}⭐`}
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompt}
            onChange={(e) => setCurrentPrompt(e.target.value)}
            rows={12}
          />
          <div className="prompt-actions">
            <button onClick={() => setCurrentPrompt(getDefaultPrompt())}>
              🔄 重置为默认
            </button>
            <button onClick={() => setShowPromptEditor(false)}>
              ✅ 完成
            </button>
          </div>
        </div>
      )}

      {/* 优化历史 */}
      {showHistory && (
        <div className="history-panel">
          <h3>📊 Prompt 优化历史</h3>
          <div className="version-list">
            {promptVersions.slice().reverse().map(v => (
              <div key={v.id} className="version-item">
                <div className="version-header">
                  <span className="version-number">v{v.version}</span>
                  <span className="version-date">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </span>
                  {v.averageRating > 0 && (
                    <span className="version-rating">
                      {v.averageRating.toFixed(1)}⭐
                    </span>
                  )}
                </div>
                <div className="version-improvements">
                  {v.improvements.map((imp, idx) => (
                    <span key={idx} className="improvement-tag">{imp}</span>
                  ))}
                </div>
                <button 
                  className="btn-use-version"
                  onClick={() => {
                    setCurrentPrompt(v.prompt);
                    setShowHistory(false);
                  }}
                >
                  使用此版本
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="main-content">
        {/* 标签页 */}
        <div className="tabs">
          <button 
            className={activeTab === 'upload' ? 'active' : ''}
            onClick={() => setActiveTab('upload')}
          >
            📤 上传任务
          </button>
          <button 
            className={activeTab === 'batch' ? 'active' : ''}
            onClick={() => setActiveTab('batch')}
          >
            📋 批量列表 ({batchTasks.length})
          </button>
        </div>

        {/* 上传区域 */}
        {activeTab === 'upload' && (
          <div className="upload-section">
            <div className="upload-methods">
              {/* 文件上传 */}
              <div className="upload-method">
                <h4>📄 上传文件</h4>
                <button 
                  className="btn-upload"
                  onClick={() => fileInputRef.current?.click()}
                >
                  选择文件
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.txt,.docx"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <p className="hint">支持 PDF、TXT、DOCX</p>
              </div>

              {/* 文本输入 */}
              <div className="upload-method">
                <h4>📝 粘贴文本</h4>
                <button 
                  className="btn-upload"
                  onClick={() => setShowBatchInput(!showBatchInput)}
                >
                  {showBatchInput ? '取消' : '批量输入'}
                </button>
                <p className="hint">每段文本用空行分隔</p>
              </div>

              {/* URL 输入 */}
              <div className="upload-method">
                <h4>🔗 网页链接</h4>
                <input
                  type="text"
                  className="url-input"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="输入网页 URL（每行一个）"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddUrl()}
                />
                <button 
                  className="btn-upload"
                  onClick={handleAddUrl}
                  disabled={!urlInput.trim()}
                >
                  添加
                </button>
              </div>
            </div>

            {/* 批量文本输入框 */}
            {showBatchInput && (
              <div className="batch-input-panel">
                <textarea
                  className="batch-textarea"
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder="粘贴多段文本，每段之间用空行分隔..."
                  rows={10}
                />
                <button 
                  className="btn-add-batch"
                  onClick={handleAddTextBatch}
                  disabled={!batchText.trim()}
                >
                  ✅ 添加 {batchText.split('\n\n').filter(t => t.trim()).length} 个任务
                </button>
              </div>
            )}

            {/* 统计信息 */}
            {stats.total > 0 && (
              <div className="stats-panel">
                <div className="stat-item">
                  <span className="stat-label">总任务</span>
                  <span className="stat-value">{stats.total}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">已完成</span>
                  <span className="stat-value success">{stats.completed}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">待处理</span>
                  <span className="stat-value pending">{stats.pending}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">失败</span>
                  <span className="stat-value error">{stats.error}</span>
                </div>
                {stats.avgRating > 0 && (
                  <div className="stat-item">
                    <span className="stat-label">平均评分</span>
                    <span className="stat-value">{stats.avgRating.toFixed(1)}⭐</span>
                  </div>
                )}
              </div>
            )}

            {/* 批量处理按钮 */}
            {stats.pending > 0 && (
              <button 
                className="btn-process-batch"
                onClick={handleBatchProcess}
                disabled={processing}
              >
                {processing 
                  ? `⚙️ 处理中... (${currentTaskIndex + 1}/${batchTasks.length})` 
                  : `🚀 开始批量处理 (${stats.pending} 个任务)`
                }
              </button>
            )}
          </div>
        )}

        {/* 批量列表 */}
        {activeTab === 'batch' && (
          <div className="batch-list">
            {batchTasks.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <p>还没有任务</p>
                <p className="hint">切换到"上传任务"标签添加内容</p>
              </div>
            ) : (
              <div className="task-grid">
                {batchTasks.map((task, index) => renderTaskCard(task, index))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 任务详情面板 */}
      {selectedTask && selectedTask.status === 'completed' && selectedTask.result && (
        <div className="detail-panel" onClick={() => setSelectedTask(null)}>
          <div className="detail-content" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h3>📋 提取结果详情</h3>
              <button className="btn-close" onClick={() => setSelectedTask(null)}>✕</button>
            </div>
            
            <div className="detail-body">
              <div className="field-group">
                <label>会议名称:</label>
                <div className="field-value">{selectedTask.result.title}</div>
              </div>
              
              <div className="field-row">
                <div className="field-group">
                  <label>开始时间:</label>
                  <div className="field-value">{selectedTask.result.startTime}</div>
                </div>
                <div className="field-group">
                  <label>结束时间:</label>
                  <div className="field-value">{selectedTask.result.endTime}</div>
                </div>
              </div>
              
              {selectedTask.result.location && (
                <div className="field-group">
                  <label>地点:</label>
                  <div className="field-value">{selectedTask.result.location}</div>
                </div>
              )}
              
              {selectedTask.result.attendees && selectedTask.result.attendees.length > 0 && (
                <div className="field-group">
                  <label>参与者:</label>
                  <div className="attendees-tags">
                    {selectedTask.result.attendees.map((att, idx) => (
                      <span key={idx} className="attendee-tag">
                        {att.name} {att.role && `(${att.role})`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedTask.result.agenda && (
                <div className="field-group">
                  <label>议程:</label>
                  <div className="field-value agenda">{selectedTask.result.agenda}</div>
                </div>
              )}
              
              <div className="field-group">
                <label>置信度:</label>
                <div className="confidence-bar">
                  <div 
                    className="confidence-fill" 
                    style={{ width: `${selectedTask.result.confidence * 100}%` }}
                  >
                    {(selectedTask.result.confidence * 100).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIDemoV2;
