import React from 'react';

import PlanManager from '@frontend/features/Plan/components/PlanManager';

export type PlanPageProps = React.ComponentProps<typeof PlanManager>;

export const PlanPage: React.FC<PlanPageProps> = (props) => {
  return <PlanManager {...props} />;
};

export default PlanPage;
