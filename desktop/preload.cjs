// The only bridge from the dashboard page to the app: named calls into backend.mjs, app-level calls (version, first-run
// setup, updates) and opening files/folders.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  call: (name, ...args) => ipcRenderer.invoke('call', name, ...args),
  app: (name, ...args) => ipcRenderer.invoke('app', name, ...args),
  open: target => ipcRenderer.invoke('open', target),
});
