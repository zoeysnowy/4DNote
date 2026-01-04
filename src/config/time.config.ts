import { TimePolicy } from '@frontend/types/time';

// Default policy aligned with local-time storage and Monday as week start
export const defaultTimePolicy: TimePolicy = {
  defaultTimeOfDay: '09:00',
  weekStart: 1, // 1 = Monday
  windowResolution: 'snap-to-start',
};
