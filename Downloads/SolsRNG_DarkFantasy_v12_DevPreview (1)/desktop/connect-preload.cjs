const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('solsServerChoice', {
  chooseLocal: () => ipcRenderer.send('sols-server-choice', { mode: 'local' }),
  chooseOnline: (url) => ipcRenderer.send('sols-server-choice', { mode: 'online', url: String(url || '') }),
  getLastUrl: () => ipcRenderer.invoke('sols-get-last-url')
});
