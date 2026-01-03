import React from 'react';

import PageContainer from '@frontend/components/common/PageContainer';
import TagManager from '@frontend/features/Tag/components/TagManager';

export type TagPageProps = React.ComponentProps<typeof TagManager>;

export const TagPage: React.FC<TagPageProps> = ({
  microsoftService,
  globalTimer,
  onTimerStart,
  onTimerPause,
  onTimerResume,
  onTimerStop,
  onTagsChange,
}) => {
  return (
    <PageContainer title="标签" subtitle="标签管理与专注表盘配置" className="tag-management">
      <div className="tag-management-layout">
        <div className="tag-setting-section">
          <div className="section-header">
            <div className="title-indicator"></div>
            <h3>标签管理</h3>
          </div>

          <div className="tag-management-hint">
            <p>子标签删除，事件默认使用父标签及其映射的日历</p>
            <p>父标签删除，事件默认同步至原先日历</p>
          </div>

          <TagManager
            microsoftService={microsoftService}
            globalTimer={globalTimer}
            onTimerStart={onTimerStart}
            onTimerPause={onTimerPause}
            onTimerResume={onTimerResume}
            onTimerStop={onTimerStop}
            onTagsChange={onTagsChange}
          />
        </div>

        <div className="focus-setting-section">
          <div className="section-header">
            <div className="title-indicator"></div>
            <h3>配置专注表盘</h3>
          </div>

          <div className="focus-hint">
            <p>点击表盘拖曳标签编辑</p>
            <p>在时光 &gt;&gt; 专注面板享用</p>
          </div>

          <div className="focus-dials">
            <div className="dial-item">
              <span>🧐开学啦</span>
            </div>
            <div className="dial-item">
              <span>😍假期假期</span>
            </div>
            <div className="dial-item">
              <span>🐶实习狗</span>
            </div>
            <div className="dial-item add-dial">
              <span>➕点击添加</span>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
};

export default TagPage;
