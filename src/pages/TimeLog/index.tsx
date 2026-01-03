import React from 'react';

import PageContainer from '@frontend/components/common/PageContainer';
import TimeLog from '@frontend/features/TimeLog/pages/TimeLogPage';

export type TimeLogPageProps = React.ComponentProps<typeof TimeLog>;

export const TimeLogPage: React.FC<TimeLogPageProps> = ({
  isPanelVisible,
  onPanelVisibilityChange,
}) => {
  return (
    <PageContainer title="时间轴" subtitle="事件时间轴与历史记录" className="timelog-container">
      <TimeLog isPanelVisible={isPanelVisible} onPanelVisibilityChange={onPanelVisibilityChange} />
    </PageContainer>
  );
};

export default TimeLogPage;
