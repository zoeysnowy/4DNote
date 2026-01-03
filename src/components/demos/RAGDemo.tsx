/**
 * RAG Demo Page
 * 
 * RAG (Retrieval-Augmented Generation) 检索增强生成演示页面
 * 
 * 功能：
 * 1. 模拟时间日志数据加载
 * 2. 本地向量检索
 * 3. 腾讯混元 AI 增强分析
 * 4. 实时结果展示
 * 
 * @author Zoey Gong
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react';
import './RAGDemo.css';
import { processTranscriptFromURL, TranscriptSegment } from '@frontend/utils/transcriptProcessor';
import type { Event as EventType } from '@frontend/types';
import { EventService } from '@backend/EventService';
import { useEventHubSnapshot } from '@frontend/hooks/useEventHubSnapshot';
import { formatDateForStorage } from '@frontend/utils/timeUtils';

interface TimestampNode {
  timestamp: string;
  title: string;
  content: string;
}

interface SearchResult {
  node: TimestampNode;
  similarity: number;
}

interface APIConfig {
  secretId: string;
  secretKey: string;
  proxyUrl: string;
}

export const RAGDemo: React.FC = () => {
  // 状态管理
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [error, setError] = useState<string>('');
  
  // Transcript 处理状态
  const [transcriptUrl, setTranscriptUrl] = useState('');
  const [transcriptProcessing, setTranscriptProcessing] = useState(false);
  const [transcriptResult, setTranscriptResult] = useState<{
    segments: number;
    events: number;
    timeRange: string;
  } | null>(null);
  const [transcriptError, setTranscriptError] = useState('');
  
  // 待处理文件列表
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  
  // 文件上传历史记录
  const [uploadHistory, setUploadHistory] = useState<Array<{
    id: string;
    fileName: string;
    fileSize: number;
    processedAt: string;
    segments: number;
    events: number;
    timeRange: string;
    status: 'success' | 'error';
    error?: string;
  }>>([]);
  
  // Transcript 配置
  const [transcriptConfig, setTranscriptConfig] = useState({
    randomizeTime: true,
    tagPrefix: 'transcript',
    daysAgo: 30, // 过去多少天
    baseTime: '16:00' // 基准时间（视频0:00对应的实际时间）
  });
  
  // 配置状态
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<APIConfig>({
    secretId: '',
    secretKey: '',
    proxyUrl: 'http://localhost:3001/api/hunyuan'
  });
  
  // 代理服务器状态
  const [proxyStatus, setProxyStatus] = useState<'checking' | 'running' | 'stopped'>('checking');
  const [isStartingProxy, setIsStartingProxy] = useState(false);

  // Master Plan v2.22: UI reads should prefer subscription-backed snapshots.
  const { events: snapshotEvents, ensureLoaded: ensureEventsLoaded } = useEventHubSnapshot({ enabled: true });
  
  // 示例数据
  const [nodes] = useState<TimestampNode[]>([
    {
      timestamp: '2024-01-01 08:30:00',
      title: 'Morning Routine - Part 1',
      content: '早上7点起床，先做了15分钟的拉伸运动。然后冲了个热水澡，感觉整个人都清醒了。今天打算去附近的咖啡馆工作，那里环境安静，适合专注。'
    },
    {
      timestamp: '2024-01-01 09:30:00',
      title: 'Morning Routine - Part 2',
      content: '到达咖啡馆后，点了一杯美式咖啡。打开笔记本电脑，开始处理邮件。今天有三个重要的会议要开，需要提前准备一下资料。'
    },
    {
      timestamp: '2024-01-01 10:30:00',
      title: 'Work Session - Part 1',
      content: '开始进入深度工作状态。今天的任务是完成一个 React 组件的开发。使用 TypeScript 写代码，确保类型安全。遇到了一个棘手的 bug，花了半小时才解决。'
    },
    {
      timestamp: '2024-01-01 12:30:00',
      title: 'Lunch Break',
      content: '中午休息时间。去附近的餐厅吃了份沙拉和三明治。午餐时看了几篇技术博客，学到了关于性能优化的新技巧。饭后在公园散步了15分钟。'
    },
    {
      timestamp: '2024-01-01 13:30:00',
      title: 'Afternoon Study',
      content: '下午学习时间。看了一个关于 AI 和机器学习的教程视频。做了笔记，记录了几个重要的概念。特别是关于 RAG（检索增强生成）的部分很有启发。'
    },
    {
      timestamp: '2024-01-01 15:00:00',
      title: 'Exercise Time',
      content: '下午3点开始运动。今天做了30分钟的跑步和20分钟的力量训练。运动后感觉很舒畅，精神状态也变好了。健身真的能提升工作效率。'
    },
    {
      timestamp: '2024-01-01 17:00:00',
      title: 'Project Work',
      content: '继续进行项目开发。今天主要focus在优化性能和修复bug上。使用了 Chrome DevTools 进行性能分析，找到了几个可以优化的点。'
    },
    {
      timestamp: '2024-01-01 19:00:00',
      title: 'Dinner Time',
      content: '晚餐时间。自己做了一份意大利面和沙拉。做饭的过程很治愈，也是一种放松方式。边吃晚餐边看了一集喜欢的美剧。'
    },
    {
      timestamp: '2024-01-01 20:30:00',
      title: 'Reading Session',
      content: '晚上阅读时间。今天看了两章技术书籍，关于系统设计的内容。做了一些笔记，对分布式系统有了更深的理解。'
    },
    {
      timestamp: '2024-01-01 22:00:00',
      title: 'Planning Tomorrow',
      content: '睡前规划明天的任务。列出了三个主要目标和几个小任务。设置好明天的提醒事项，准备明天早起锻炼。'
    }
  ]);

  // 检查代理服务器状态
  useEffect(() => {
    checkProxyHealth();
    const interval = setInterval(checkProxyHealth, 10000); // 每10秒检查一次
    return () => clearInterval(interval);
  }, [config.proxyUrl]);

  // 一键启动代理服务器
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
        // 延迟检查，确保服务器完全启动
        setTimeout(() => checkProxyHealth(), 1000);
      } else {
        alert(`❌ 启动失败\n\n${result.error || '未知错误'}`);
      }
    } catch (error: any) {
      alert(`❌ 启动失败\n\n${error.message}`);
      console.error('启动代理失败:', error);
    } finally {
      setIsStartingProxy(false);
    }
  };

  const checkProxyHealth = async () => {
    try {
      const response = await fetch(config.proxyUrl.replace('/api/hunyuan', '/health'));
      setProxyStatus(response.ok ? 'running' : 'stopped');
    } catch {
      setProxyStatus('stopped');
    }
  };

  // 简单的关键词检索
  const simpleSearch = (searchQuery: string): SearchResult[] => {
    const keywords = searchQuery
      .toLowerCase()
      .replace(/[，。！？；：""''（）【】《》]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0);

    const scored = nodes.map(node => {
      const content = (node.title + ' ' + node.content).toLowerCase();
      const matches = keywords.filter(keyword => content.includes(keyword)).length;
      const similarity = keywords.length > 0 ? (matches / keywords.length) * 100 : 0;
      
      return { node, similarity };
    });

    return scored
      .filter(item => item.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  // 调用混元 AI
  const callHunyuanAI = async (searchQuery: string, context: string): Promise<string> => {
    if (!config.secretId || !config.secretKey) {
      throw new Error('请先配置腾讯云密钥');
    }

    const messages = [
      {
        role: 'user',
        content: `基于以下时间日志，回答问题："${searchQuery}"\n\n时间日志：\n${context}\n\n请提供简洁、有条理的回答。`
      }
    ];

    const response = await fetch(config.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        secretId: config.secretId,
        secretKey: config.secretKey,
        model: 'hunyuan-lite',
        messages,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    // 兼容不同的响应格式
    if (data.Response && data.Response.Choices && data.Response.Choices[0]) {
      return data.Response.Choices[0].Message.Content;
    } else if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    } else {
      throw new Error('未知的响应格式');
    }
  };

  // 执行搜索
  const handleSearch = async () => {
    if (!query.trim()) {
      setError('请输入查询内容');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);
    setAiResponse('');

    try {
      // 1. 本地检索
      const searchResults = simpleSearch(query);
      setResults(searchResults);

      // 2. AI 增强（如果配置了密钥）
      if (config.secretId && config.secretKey && searchResults.length > 0) {
        const context = searchResults.map((item, i) => 
          `${i + 1}. ${item.node.timestamp} - ${item.node.title}\n   ${item.node.content}`
        ).join('\n\n');

        const aiAnswer = await callHunyuanAI(query, context);
        setAiResponse(aiAnswer);
      }
    } catch (err: any) {
      setError(err.message || '搜索失败');
      console.error('搜索错误:', err);
    } finally {
      setLoading(false);
    }
  };

  // 处理 Transcript URL
  const handleTranscriptProcess = async () => {
    if (!transcriptUrl.trim()) {
      setTranscriptError('请输入 Transcript URL');
      return;
    }

    setTranscriptProcessing(true);
    setTranscriptError('');
    setTranscriptResult(null);

    try {
      // 计算时间范围
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - transcriptConfig.daysAgo);

      // 处理 transcript 并生成 events
      const events = await processTranscriptFromURL(transcriptUrl, {
        startDate,
        endDate,
        randomizeTime: transcriptConfig.randomizeTime,
        tagPrefix: transcriptConfig.tagPrefix
      });

      // 批量创建事件
      const result = await EventService.batchCreateEvents(events);

      // 显示结果
      setTranscriptResult({
        segments: events.length,
        events: result.created,
        timeRange: `${startDate.toLocaleDateString('zh-CN')} ~ ${endDate.toLocaleDateString('zh-CN')}`
      });

      // 清空输入
      setTranscriptUrl('');
    } catch (err: any) {
      setTranscriptError(err.message || '处理失败');
      console.error('Transcript 处理错误:', err);
    } finally {
      setTranscriptProcessing(false);
    }
  };

  // 处理文件上传
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setTranscriptProcessing(true);
    setTranscriptError('');

    try {
      await ensureEventsLoaded();
      const localEvents: EventType[] = [...(snapshotEvents || [])];

      for (const file of Array.from(files)) {
        console.log('[RAGDemo] 处理文件:', file.name);
        
        const fileId = `${Date.now()}_${file.name}`;
        
        try {
          // 读取文件内容
          const text = await file.text();
          console.log('[RAGDemo] 文件内容长度:', text.length);
          console.log('[RAGDemo] 文件前200字符:', text.substring(0, 200));
          
          // 计算时间范围（过去 N 天到今天）
          const now = new Date();
          const pastDate = new Date();
          pastDate.setDate(pastDate.getDate() - transcriptConfig.daysAgo);

          // 解析并生成事件
          const { parseTranscript, transcriptToEvents } = await import('@frontend/utils/transcriptProcessor');
          const segments = parseTranscript(text);
          
          console.log('[RAGDemo] 解析出片段数:', segments.length);
          
          if (segments.length === 0) {
            throw new Error(
              `未能解析出任何内容。请确保文件格式正确：\n` +
              `VTT格式：需要包含 "WEBVTT" 标记和时间戳 (00:00:00.000)\n` +
              `SRT格式：需要序号、时间戳 (00:00:00,000 --> 00:00:01,000) 和文本\n` +
              `TXT格式：需要包含时间戳如 [00:01], (1:23), 或 00:01:23`
            );
          }
          
          // 提取文件名作为标题（去掉扩展名）
          const fileName = file.name.replace(/\.(vtt|srt|txt)$/i, '');
          
          // 🔧 如果使用基准时间模式，使用今天；否则在时间范围内随机
          const targetDate = transcriptConfig.baseTime ? now : pastDate;
          
          // 生成单个事件（整个文件的内容）
          const event = transcriptToEvents(segments, {
            startDate: targetDate,  // ✅ 修正：随机模式使用过去某天，基准时间模式使用今天
            endDate: pastDate,      // ✅ 时间范围的结束边界（过去）
            randomizeTime: transcriptConfig.randomizeTime,
            tagPrefix: transcriptConfig.tagPrefix,
            baseTime: transcriptConfig.baseTime,
            fileName: fileName
          })[0]; // 只取第一个事件（整个文件）

          console.log('[RAGDemo] 生成事件:', event);

          // 🔍 检查是否已存在同名事件（避免重复上传）
          const duplicateEvent = localEvents.find((e: any) => {
            const eventTitle = typeof e.title === 'string' ? e.title : e.title?.simpleTitle;
            return eventTitle === fileName;
          });
          
          if (duplicateEvent) {
            const overwrite = confirm(
              `已存在同名事件"${fileName}"。\n\n` +
              `创建时间：${duplicateEvent.createdAt}\n` +
              `是否覆盖？\n\n` +
              `点击"确定"覆盖，点击"取消"跳过`
            );
            
            if (!overwrite) {
              console.log('[RAGDemo] ⏭️ 跳过重复事件:', fileName);
              continue; // 跳过此文件
            }
            
            // 删除旧事件
            await EventService.deleteEvent(duplicateEvent.id);
            console.log('[RAGDemo] 🗑️ 已删除旧事件:', duplicateEvent.id);

            const idx = localEvents.findIndex(e => e.id === duplicateEvent.id);
            if (idx >= 0) {
              localEvents.splice(idx, 1);
            }
          }

          // 批量创建事件
          const result = await EventService.batchCreateEvents([event]);
          
          console.log('[RAGDemo] 创建结果:', result);

          if (result.created === 0) {
            throw new Error(`事件创建失败。${result.errors.join('; ')}`);
          }

          localEvents.push(event as unknown as EventType);
          
          // 🔥 触发全局事件更新，让 TimeCalendar 刷新
          window.dispatchEvent(new CustomEvent('events-updated', { 
            detail: { source: 'RAGDemo', eventId: event.id } 
          }));
          console.log('[RAGDemo] ✅ 已触发 events-updated 事件');


          // 添加到历史记录
          const historyItem = {
            id: fileId,
            fileName: file.name,
            fileSize: file.size,
            processedAt: new Date().toLocaleString('zh-CN'),
            segments: segments.length,
            events: result.created,
            timeRange: `${targetDate.toLocaleDateString('zh-CN')} ${transcriptConfig.baseTime || ''}`,
            status: 'success' as const
          };
          
          setUploadHistory(prev => [historyItem, ...prev]);
          
          console.log(`[RAGDemo] ✅ ${file.name} 处理成功:`, result.created, '个事件');
          
          // 显示成功提示
          alert(`✅ 处理成功！\n\n文件：${file.name}\n片段：${segments.length} 个\n事件标题：${fileName}\n事件时间：${targetDate.toLocaleDateString()} ${transcriptConfig.baseTime || ''}\n\n请切换到 TimeCalendar 页面查看生成的事件`);
          
        } catch (err: any) {
          console.error(`[RAGDemo] ❌ ${file.name} 处理失败:`, err);
          
          // 添加错误记录
          setUploadHistory(prev => [{
            id: fileId,
            fileName: file.name,
            fileSize: file.size,
            processedAt: new Date().toLocaleString('zh-CN'),
            segments: 0,
            events: 0,
            timeRange: '',
            status: 'error',
            error: err.message
          }, ...prev]);
          
          // 显示错误提示
          alert(`❌ 处理失败\n\n文件：${file.name}\n错误：${err.message}`);
        }
      }
      
      // 清空文件选择
      event.target.value = '';
      
    } catch (err: any) {
      setTranscriptError(err.message || '文件处理失败');
      console.error('文件上传错误:', err);
    } finally {
      setTranscriptProcessing(false);
    }
  };

  // 示例查询
  const exampleQueries = [
    '今天早上做了什么？',
    '健身相关的活动',
    '学习了哪些内容？',
    '晚上的安排'
  ];

  return (
    <div className="rag-demo">
      <div className="rag-header">
        <h1>🔍 RAG 检索演示</h1>
        <p className="subtitle">检索增强生成 (Retrieval-Augmented Generation)</p>
        
        <div className="status-bar">
          <div className={`proxy-status ${proxyStatus}`}>
            <span className="status-dot"></span>
            代理服务器: {proxyStatus === 'running' ? '运行中' : proxyStatus === 'checking' ? '检查中...' : '已停止'}
          </div>
          
          {/* Electron 环境显示一键启动按钮 */}
          {proxyStatus === 'stopped' && ((window as any).electron?.invoke || (window as any).electronAPI?.invoke) && (
            <button 
              className="start-proxy-btn"
              onClick={handleStartProxy}
              disabled={isStartingProxy}
            >
              {isStartingProxy ? '🔄 启动中...' : '🚀 启动代理'}
            </button>
          )}
          
          <button 
            className="config-btn"
            onClick={() => setShowConfig(!showConfig)}
          >
            ⚙️ {showConfig ? '隐藏' : '显示'}配置
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="config-panel">
          <h3>🔑 腾讯云密钥配置</h3>
          <div className="config-form">
            <div className="form-group">
              <label>Secret ID:</label>
              <input
                type="text"
                value={config.secretId}
                onChange={(e) => setConfig({...config, secretId: e.target.value})}
                placeholder="AKID..."
              />
            </div>
            
            <div className="form-group">
              <label>Secret Key:</label>
              <input
                type="password"
                value={config.secretKey}
                onChange={(e) => setConfig({...config, secretKey: e.target.value})}
                placeholder="密钥"
              />
            </div>
            
            <div className="form-group">
              <label>代理 URL:</label>
              <input
                type="text"
                value={config.proxyUrl}
                onChange={(e) => setConfig({...config, proxyUrl: e.target.value})}
                placeholder="http://localhost:3001/api/hunyuan"
              />
            </div>
            
            <div className="config-hint">
              💡 提示: 在 ai-proxy/.env 文件中配置密钥后，代理服务器会自动读取
            </div>
          </div>
        </div>
      )}

      <div className="search-panel">
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入你想查询的内容..."
            disabled={loading}
          />
          <button 
            className="search-btn"
            onClick={handleSearch}
            disabled={loading}
          >
            {loading ? '搜索中...' : '🔍 搜索'}
          </button>
        </div>

        <div className="example-queries">
          <span>示例查询：</span>
          {exampleQueries.map((q, i) => (
            <button
              key={i}
              className="example-btn"
              onClick={() => setQuery(q)}
              disabled={loading}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="results-section">
          <h2>📊 本地向量检索结果</h2>
          <div className="results-list">
            {results.map((result, i) => (
              <div key={i} className="result-item">
                <div className="result-header">
                  <span className="result-rank">#{i + 1}</span>
                  <span className="result-similarity">
                    相似度: {result.similarity.toFixed(1)}%
                  </span>
                </div>
                <div className="result-title">
                  <span className="timestamp">{result.node.timestamp}</span>
                  <span className="title">{result.node.title}</span>
                </div>
                <div className="result-content">
                  {result.node.content}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aiResponse && (
        <div className="ai-response-section">
          <h2>🤖 腾讯混元 AI 分析</h2>
          <div className="ai-response">
            {aiResponse.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {!loading && !results.length && !error && (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <h3>开始你的 RAG 搜索</h3>
          <p>输入问题或点击示例查询来体验检索增强生成</p>
          
          <div className="features">
            <div className="feature">
              <span className="feature-icon">⚡</span>
              <span>本地关键词检索</span>
            </div>
            <div className="feature">
              <span className="feature-icon">🧠</span>
              <span>AI 智能分析</span>
            </div>
            <div className="feature">
              <span className="feature-icon">📈</span>
              <span>相似度排序</span>
            </div>
          </div>
        </div>
      )}

      {/* Transcript Processing Section */}
      <div className="transcript-section" style={{ marginTop: '40px', padding: '24px', background: '#f8f9fa', borderRadius: '8px' }}>
        <h2>🎬 字幕文件转 Events</h2>
        <p style={{ color: '#666', marginBottom: '20px' }}>
          上传字幕文件（VTT、SRT、TXT格式），自动提取时间戳并生成带时间标记的事件
        </p>

        {/* 文件上传区域 */}
        <div style={{ 
          border: '2px dashed #ddd', 
          borderRadius: '8px', 
          padding: '32px', 
          textAlign: 'center',
          background: '#fff',
          marginBottom: '24px',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = '#007bff';
          e.currentTarget.style.background = '#f0f8ff';
        }}
        onDragLeave={(e) => {
          e.currentTarget.style.borderColor = '#ddd';
          e.currentTarget.style.background = '#fff';
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.style.borderColor = '#ddd';
          e.currentTarget.style.background = '#fff';
          const files = e.dataTransfer.files;
          if (files.length > 0) {
            const input = document.getElementById('transcript-file-input') as HTMLInputElement;
            if (input) {
              input.files = files;
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }}
        onClick={() => document.getElementById('transcript-file-input')?.click()}
        >
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
          <p style={{ fontSize: '16px', fontWeight: 500, marginBottom: '8px' }}>
            点击或拖拽文件到这里上传
          </p>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
            支持批量上传 .vtt、.srt、.txt 格式的字幕文件
          </p>
          <input
            id="transcript-file-input"
            type="file"
            accept=".vtt,.srt,.txt"
            multiple
            onChange={handleFileUpload}
            disabled={transcriptProcessing}
            style={{ display: 'none' }}
          />
          <button
            style={{
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#fff',
              background: transcriptProcessing ? '#ccc' : '#007bff',
              border: 'none',
              borderRadius: '4px',
              cursor: transcriptProcessing ? 'not-allowed' : 'pointer',
              pointerEvents: 'none'
            }}
          >
            {transcriptProcessing ? '⏳ 处理中...' : '📤 选择文件'}
          </button>
        </div>

        {/* 配置选项 */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', fontSize: '14px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!transcriptConfig.randomizeTime}
                onChange={(e) => setTranscriptConfig({ ...transcriptConfig, randomizeTime: !e.target.checked })}
                style={{ marginRight: '8px', width: '18px', height: '18px' }}
              />
              <strong>使用视频时间戳</strong>
            </label>
            <span style={{ fontSize: '12px', color: '#666' }}>
              （勾选后将根据视频原始时间戳生成事件）
            </span>
          </div>
          
          {!transcriptConfig.randomizeTime ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '16px', background: '#fff', borderRadius: '4px', border: '1px solid #ddd' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                  视频开始时间 <span style={{ color: '#999' }}>(视频0:00对应的实际时间)</span>
                </label>
                <input
                  type="time"
                  value={transcriptConfig.baseTime}
                  onChange={(e) => setTranscriptConfig({ ...transcriptConfig, baseTime: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                  事件日期
                </label>
                <input
                  type="date"
                  value={transcriptConfig.daysAgo === 0 ? formatDateForStorage(new Date()) : ''}
                  onChange={(e) => {
                    const selectedDate = new Date(e.target.value);
                    const today = new Date();
                    const daysAgo = Math.floor((today.getTime() - selectedDate.getTime()) / (1000 * 60 * 60 * 24));
                    setTranscriptConfig({ ...transcriptConfig, daysAgo: Math.max(0, daysAgo) });
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
                  过去 <strong>{transcriptConfig.daysAgo}</strong> 天
                </label>
                <input
                  type="number"
                  value={transcriptConfig.daysAgo}
                  onChange={(e) => setTranscriptConfig({ ...transcriptConfig, daysAgo: parseInt(e.target.value) || 30 })}
                  min="1"
                  max="365"
                  style={{
                    width: '100%',
                    padding: '8px',
                    fontSize: '14px',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '14px', color: '#666' }}>
                  将随机分配到过去{transcriptConfig.daysAgo}天内
                </span>
              </div>
            </div>
          )}
        </div>

        {transcriptError && (
          <div style={{ padding: '12px', background: '#fee', color: '#c33', borderRadius: '4px', marginBottom: '16px' }}>
            ❌ {transcriptError}
          </div>
        )}

        {/* 上传历史记录 */}
        {uploadHistory.length > 0 && (
          <div style={{ marginTop: '24px' }}>
            <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📋 处理记录 
              <span style={{ fontSize: '14px', color: '#666', fontWeight: 'normal' }}>
                ({uploadHistory.length} 个文件)
              </span>
            </h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #ddd', borderRadius: '4px' }}>
              {uploadHistory.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid #eee',
                    background: item.status === 'success' ? '#fff' : '#fff5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontSize: '18px' }}>
                        {item.status === 'success' ? '✅' : '❌'}
                      </span>
                      <span style={{ fontWeight: 500, fontSize: '14px' }}>
                        {item.fileName}
                      </span>
                      <span style={{ fontSize: '12px', color: '#999' }}>
                        ({(item.fileSize / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginLeft: '26px' }}>
                      {item.status === 'success' ? (
                        <>
                          {item.processedAt} · {item.segments} 个片段 → {item.events} 个事件 · {item.timeRange}
                        </>
                      ) : (
                        <>
                          {item.processedAt} · 处理失败: {item.error}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setUploadHistory(prev => prev.filter(h => h.id !== item.id))}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      color: '#999',
                      background: 'transparent',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    删除
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="data-info">
        <p>📝 当前加载了 {nodes.length} 条时间日志数据</p>
        <p>💡 本演示使用模拟数据，实际应用中会从 4DNote 数据库加载真实的时间日志</p>
      </div>
    </div>
  );
};

export default RAGDemo;
