const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tembo', {
  init: () => ipcRenderer.invoke('init'),
  looseCount: folder => ipcRenderer.invoke('loose-count', folder),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  analyze: folder => ipcRenderer.invoke('analyze', folder),
  onScanProgress: cb => ipcRenderer.on('scan-progress', (_e, folder, n) => cb(folder, n)),
  apply: (folder, ids, opts) => ipcRenderer.invoke('apply', folder, ids, opts),
  arrange: folder => ipcRenderer.invoke('arrange', folder),
  undo: folder => ipcRenderer.invoke('undo', folder),
  openFolder: folder => ipcRenderer.invoke('open-folder', folder),
  updateStatus: () => ipcRenderer.invoke('update-status'),
  installUpdate: () => ipcRenderer.invoke('update-install'),
  onUpdateStatus: cb => ipcRenderer.on('update-status', (_e, s) => cb(s)),
  onOpenFolder: cb => ipcRenderer.on('open-folder', (_e, folder) => cb(folder)),
});
