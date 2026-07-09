/* Tab-navigation seam. View modules call switchTab() to change the active tab
   without importing app.ts (which would be a circular import). app.ts owns the
   real implementation and registers it via setSwitchTab() at startup; the
   live-binding export means importers always see the registered function. */
export let switchTab: (id: string) => void = () => {};
export function setSwitchTab(fn: (id: string) => void){ switchTab = fn; }
