import React from 'react';

import PageContainer from '@frontend/components/common/PageContainer';
import { TimeCalendar } from '@frontend/features/Calendar/TimeCalendar';

export type CalendarPageProps = React.ComponentProps<typeof TimeCalendar>;

export const CalendarPage: React.FC<CalendarPageProps> = (props) => {
  return (
    <PageContainer title="时光" subtitle="时光日志与我的日历" className="time-calendar">
      <TimeCalendar {...props} />
    </PageContainer>
  );
};

export default CalendarPage;
