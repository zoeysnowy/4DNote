export type AuthStateListener = () => void;

let isAuthenticated = false;
const listeners = new Set<AuthStateListener>();

export const AuthStore = {
  getSnapshot(): boolean {
    return isAuthenticated;
  },

  setAuthenticated(next: boolean): void {
    if (isAuthenticated === next) return;
    isAuthenticated = next;
    for (const listener of listeners) listener();
  },

  subscribe(listener: AuthStateListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }
};
