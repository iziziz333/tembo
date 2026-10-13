const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tembo', {
  init: () => ipcRenderer.invoke('init'),
  looseCount: folder => ipcRenderer.invoke('loose-count', folder),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  analyze: folder => ipcRenderer.invoke('analyze', folder),
  onScanProgress: cb => ipcRenderer.on('scan-progress', (_e, folder, n) => cb(folder, n)),
  apply: (folder, ids) => ipcRenderer.invoke('apply', folder, ids),
  undo: folder => ipcRenderer.invoke('undo', folder),
  openFolder: folder => ipcRenderer.invoke('open-folder', folder),
});
