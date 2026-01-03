import React from 'react';
import './GlassIconBar.css';

// 使用真实 SVG 资源（位于 assets/icons）
// 说明：项目已安装 vite-plugin-svgr，可使用 ?react 方式，也可用 <img>. 为减少打包体积与保持现有 index.ts 结构，这里用 <img src>。
import recordSvg from '../assets/icons/add.svg';
import voiceSvg from '../assets/icons/voice.svg';
import videoSvg from '../assets/icons/video.svg';
import imageSvg from '../assets/icons/add_pic.svg';
import audioSvg from '../assets/icons/RecNote.svg';
import docSvg from '../assets/icons/doc.svg';
import projectSvg from '../assets/icons/project.svg';
import bookmarkSvg from '../assets/icons/collect.svg';
import exportSvg from '../assets/icons/export.svg';

interface GlassIconSpec {
  id: string;
  label: string;
  src: string;
  active?: boolean;
  aria?: string; // 自定义 aria-label override
}

// 图标与动作映射。后续可抽象配置来自服务端 / 用户偏好。
const ICONS: GlassIconSpec[] = [
  { id: 'record', label: '记录此刻', src: recordSvg, active: true },
  { id: 'voice', label: '语音记录', src: voiceSvg },
  { id: 'video', label: '视频', src: videoSvg },
  { id: 'image', label: '图片', src: imageSvg },
  { id: 'audio', label: '音频', src: audioSvg },
  { id: 'doc', label: '文档', src: docSvg },
  { id: 'project', label: '项目', src: projectSvg },
  { id: 'bookmark', label: '网页收藏', src: bookmarkSvg },
  { id: 'export', label: '导出', src: exportSvg },
];

export const GlassIconBar: React.FC<{ onAction?: (id: string) => void }> = ({ onAction }) => {
  return (
    <aside className="glass-icon-bar" aria-label="时光日志操作栏">
      <div className="glass-icon-group" role="group" aria-label="快速操作">
        {ICONS.map(btn => (
          <div key={btn.id} className="glass-btn-wrapper">
            <button
              type="button"
              className="glass-icon-btn"
              data-active={btn.active || false}
              aria-label={btn.aria || btn.label}
              onClick={() => onAction?.(btn.id)}
            >
              <img src={btn.src} alt="" width={24} height={24} aria-hidden="true" />
            </button>
            <span className="glass-icon-label">{btn.label}</span>
          </div>
        ))}
      </div>
    </aside>
  );
};

export default GlassIconBar;
