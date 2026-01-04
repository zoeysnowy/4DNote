export type UISnapshot = {
  isPanelVisible: boolean;
};

export type UIStateListener = () => void;

let snapshot: UISnapshot = {
  isPanelVisible: false
};

const listeners = new Set<UIStateListener>();

function notify(): void {
  for (const listener of listeners) listener();
}

export const UIStore = {
  getSnapshot(): UISnapshot {
    return snapshot;
  },

  subscribe(listener: UIStateListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setPanelVisible(isPanelVisible: boolean): void {
    if (snapshot.isPanelVisible === isPanelVisible) return;
    snapshot = { ...snapshot, isPanelVisible };
    notify();
  },

  togglePanel(): void {
    this.setPanelVisible(!snapshot.isPanelVisible);
  }
};
