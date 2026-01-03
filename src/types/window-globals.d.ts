export {};

declare global {
  interface Window {
    FourDNoteCache?: {
      tags?: {
        service?: {
          getFlatTags: () => any[];
        };
      };
    };

    TagService?: {
      initialize: () => Promise<void>;
      getFlatTags: () => Array<{
        id: string;
        calendarMapping?: {
          calendarId?: string;
        };
      }>;
    };

    EventHub?: {
      subscribe: (eventName: string, handler: (...args: any[]) => void) => void;
    };

    debugSyncManager?: {
      getActionQueue: () => unknown;
      getConflictQueue: () => unknown;
      isRunning: () => boolean;
      isSyncInProgress: () => boolean;
      getLastSyncTime: () => Date;
      triggerSync: () => Promise<void>;
      checkTagMapping: (tagId: string) => unknown;
      getHealthScore: () => number;
      getIncrementalUpdateCount: () => number;
      resetFullCheck: () => void;
    };
  }

  interface WindowEventMap {
    calendarViewChanged: CustomEvent<{ visibleStart: string | number | Date; visibleEnd: string | number | Date }>;
    visibleRangeSynced: CustomEvent<{ count: number; startDate: Date; endDate: Date }>;
  }
}
