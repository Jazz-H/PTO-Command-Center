/* Re-render seam. View modules call refresh() to repaint the whole app after a
   mutation, without importing app.ts (which would be a circular import). app.ts
   owns the real implementation and registers it via setRefresh() at startup;
   the live-binding export means importers always see the registered function. */
export let refresh: () => void = () => {};
export function setRefresh(fn: () => void){ refresh = fn; }
